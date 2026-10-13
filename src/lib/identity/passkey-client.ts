import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  WebAuthnError,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

/** Browser side of the passkey endpoints (see lib/identity/passkeys.ts). */
export type PasskeyError =
  /** The browser can't do WebAuthn. */
  | "unsupported"
  /** The player dismissed the prompt, or it timed out. */
  | "cancelled"
  /** This device already holds a passkey for this player. */
  | "already_saved"
  /** The passkey isn't one this site knows (e.g. its player was deleted). */
  | "not_recognised"
  | "rate_limited"
  | "failed";

export type PasskeyOutcome<T = object> = ({ ok: true } & T) | { ok: false; error: PasskeyError };

export const isPasskeySupported = () => browserSupportsWebAuthn();

async function post(path: string, body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

function serverError(status: number): PasskeyError {
  if (status === 429) return "rate_limited";
  if (status === 400) return "not_recognised";
  return "failed";
}

export function browserError(error: unknown): PasskeyError {
  const cause = error instanceof WebAuthnError ? error.cause : error;
  if (error instanceof WebAuthnError && error.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
    return "already_saved";
  }
  if (error instanceof WebAuthnError && error.code === "ERROR_CEREMONY_ABORTED") return "cancelled";
  if (cause instanceof Error && (cause.name === "NotAllowedError" || cause.name === "AbortError")) return "cancelled";
  return "failed";
}

/** Saves a passkey for the signed-in player, so they can sign back in on another device. */
export async function savePasskey(): Promise<PasskeyOutcome> {
  if (!isPasskeySupported()) return { ok: false, error: "unsupported" };
  try {
    const options = await post("/api/passkeys/register/options");
    if (options.status !== 200) return { ok: false, error: options.status === 429 ? "rate_limited" : "failed" };

    let response;
    try {
      response = await startRegistration({
        optionsJSON: options.data as unknown as PublicKeyCredentialCreationOptionsJSON,
      });
    } catch (error) {
      return { ok: false, error: browserError(error) };
    }

    const verified = await post("/api/passkeys/register/verify", { response });
    if (verified.status === 200 && verified.data.status === "ok") return { ok: true };
    return { ok: false, error: verified.status === 429 ? "rate_limited" : "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** Signs this browser into the identity a passkey was saved for. On success, finish with `signIn("guest")`. */
export async function signInWithPasskey(): Promise<PasskeyOutcome<{ name: string }>> {
  if (!isPasskeySupported()) return { ok: false, error: "unsupported" };
  try {
    const options = await post("/api/passkeys/sign-in/options");
    if (options.status !== 200) return { ok: false, error: serverError(options.status) };

    let response;
    try {
      response = await startAuthentication({
        optionsJSON: options.data as unknown as PublicKeyCredentialRequestOptionsJSON,
      });
    } catch (error) {
      return { ok: false, error: browserError(error) };
    }

    const verified = await post("/api/passkeys/sign-in/verify", { response });
    const name = verified.data.name;
    if (verified.status === 200 && verified.data.status === "ok" && typeof name === "string") return { ok: true, name };
    return { ok: false, error: serverError(verified.status) };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export function passkeyErrorMessage(error: PasskeyError): string | null {
  switch (error) {
    case "cancelled":
      return null; // the player chose to stop; nothing to report
    case "unsupported":
      return "This browser doesn't support passkeys.";
    case "already_saved":
      return "This device already has a passkey for you.";
    case "not_recognised":
      return "That passkey isn't linked to a player here.";
    case "rate_limited":
      return "Too many attempts. Please wait a few minutes.";
    case "failed":
      return "Something went wrong with the passkey. Please try again.";
  }
}
