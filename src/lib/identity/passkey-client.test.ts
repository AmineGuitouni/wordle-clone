import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => ({
  supported: true,
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));

vi.mock("@simplewebauthn/browser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@simplewebauthn/browser")>()),
  browserSupportsWebAuthn: () => browser.supported,
  startRegistration: browser.startRegistration,
  startAuthentication: browser.startAuthentication,
}));

import { WebAuthnError } from "@simplewebauthn/browser";
import { browserError, passkeyErrorMessage, savePasskey, signInWithPasskey } from "./passkey-client";

type Reply = { status?: number; body?: unknown };

/** Answers the passkey endpoints in order and records what was posted. */
function server(...replies: Reply[]) {
  const fetchMock = vi.fn(async (_path: string, _init?: RequestInit) => {
    const { status = 200, body = {} } = replies.shift() ?? {};
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const domError = (name: string) => Object.assign(new Error(name), { name });

describe("passkey client", () => {
  beforeEach(() => {
    browser.supported = true;
    browser.startRegistration.mockReset().mockResolvedValue({ id: "credential" });
    browser.startAuthentication.mockReset().mockResolvedValue({ id: "credential" });
  });

  afterEach(() => vi.unstubAllGlobals());

  describe("savePasskey", () => {
    it("runs options, the browser prompt and verification in order", async () => {
      const fetchMock = server({ body: { challenge: "c" } }, { body: { status: "ok" } });

      expect(await savePasskey()).toEqual({ ok: true });
      expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
        "/api/passkeys/register/options",
        "/api/passkeys/register/verify",
      ]);
      expect(browser.startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: "c" } });
      expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({ response: { id: "credential" } });
    });

    it("reports a dismissed prompt as cancelled without calling the server again", async () => {
      const fetchMock = server({ body: { challenge: "c" } });
      browser.startRegistration.mockRejectedValue(domError("NotAllowedError"));

      expect(await savePasskey()).toEqual({ ok: false, error: "cancelled" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("recognises a device that already holds the passkey", async () => {
      server({ body: { challenge: "c" } });
      browser.startRegistration.mockRejectedValue(
        new WebAuthnError({
          message: "already registered",
          code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
          cause: domError("InvalidStateError"),
        }),
      );
      expect(await savePasskey()).toEqual({ ok: false, error: "already_saved" });
    });

    it("maps server refusals and network failures", async () => {
      server({ status: 429 });
      expect(await savePasskey()).toEqual({ ok: false, error: "rate_limited" });

      server({ body: { challenge: "c" } }, { status: 400, body: { error: "invalid_passkey" } });
      expect(await savePasskey()).toEqual({ ok: false, error: "failed" });

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
      expect(await savePasskey()).toEqual({ ok: false, error: "failed" });
    });

    it("does nothing in a browser without WebAuthn", async () => {
      const fetchMock = server();
      browser.supported = false;
      expect(await savePasskey()).toEqual({ ok: false, error: "unsupported" });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("signInWithPasskey", () => {
    it("returns the player's name on success", async () => {
      server({ body: { challenge: "c" } }, { body: { status: "ok", name: "Amira" } });
      expect(await signInWithPasskey()).toEqual({ ok: true, name: "Amira" });
    });

    it("explains a passkey the server doesn't know", async () => {
      server({ body: { challenge: "c" } }, { status: 400, body: { error: "invalid_passkey" } });
      expect(await signInWithPasskey()).toEqual({ ok: false, error: "not_recognised" });
    });

    it("treats a timed-out or aborted prompt as cancelled", async () => {
      server({ body: { challenge: "c" } });
      browser.startAuthentication.mockRejectedValue(domError("AbortError"));
      expect(await signInWithPasskey()).toEqual({ ok: false, error: "cancelled" });
    });

    it("rejects a success response without a name", async () => {
      server({ body: { challenge: "c" } }, { body: { status: "ok" } });
      expect(await signInWithPasskey()).toEqual({ ok: false, error: "failed" });
    });
  });

  it("maps unknown browser errors to a generic failure", () => {
    expect(browserError(new Error("weird"))).toBe("failed");
    expect(browserError("not even an error")).toBe("failed");
  });

  it("stays quiet when the player cancels, and explains everything else", () => {
    expect(passkeyErrorMessage("cancelled")).toBeNull();
    for (const error of ["unsupported", "already_saved", "not_recognised", "rate_limited", "failed"] as const) {
      expect(passkeyErrorMessage(error)).toEqual(expect.any(String));
    }
  });
});
