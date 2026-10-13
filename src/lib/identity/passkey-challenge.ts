import { getCache, CacheUnavailableError, type Cache } from "@/lib/cache";
import { fromBase64Url, randomToken, sign, toBase64Url, verifySignature } from "./crypto";

/**
 * Stateless WebAuthn challenges, like the proof-of-work ones: the challenge the browser signs is a token carrying
 * the ceremony, the player it is for (registration only), a nonce and an expiry, under an HMAC. Verifying needs
 * no stored state; the only state is a short-lived "used" marker that makes each challenge single use.
 */
export type Ceremony = "register" | "sign-in";

export const PASSKEY_CHALLENGE_TTL_SECONDS = 5 * 60;

type Options = { now?: () => number; secret?: string };
type Payload = { c: Ceremony; u?: string; n: string; e: number };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The token, passed to SimpleWebAuthn as the challenge (it base64url-encodes it for the browser). */
export async function createPasskeyChallenge(
  ceremony: Ceremony,
  userId?: string,
  { now = Date.now, secret }: Options = {},
): Promise<string> {
  const payload: Payload = { c: ceremony, n: randomToken(16), e: now() + PASSKEY_CHALLENGE_TTL_SECONDS * 1000 };
  if (userId) payload.u = userId;
  const data = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${data}.${await sign("passkey", data, secret)}`;
}

/**
 * Checks the challenge echoed back in a WebAuthn response (base64url, as found in clientDataJSON). Returns the
 * challenge's nonce when it is genuine, unexpired and meant for this ceremony (and player), otherwise null.
 * It does not consume the challenge; call `consumePasskeyChallenge` once the whole response has verified.
 */
export async function readPasskeyChallenge(
  echoed: string,
  expected: { ceremony: Ceremony; userId?: string },
  { now = Date.now, secret }: Options = {},
): Promise<string | null> {
  const bytes = fromBase64Url(echoed);
  if (!bytes) return null;
  const [data, signature, ...rest] = decoder.decode(bytes).split(".");
  if (!data || !signature || rest.length > 0) return null;
  if (!(await verifySignature("passkey", data, signature, secret))) return null;

  let payload: Partial<Payload>;
  try {
    payload = JSON.parse(decoder.decode(fromBase64Url(data) ?? new Uint8Array())) as Partial<Payload>;
  } catch {
    return null;
  }
  if (payload.c !== expected.ceremony || payload.u !== expected.userId) return null;
  if (typeof payload.e !== "number" || payload.e <= now()) return null;
  return typeof payload.n === "string" ? payload.n : null;
}

/** Marks a challenge as used. Resolves to false if it already was (a replay). Fails open if the cache is down. */
export async function consumePasskeyChallenge(nonce: string, { cache = getCache() }: { cache?: Cache } = {}) {
  try {
    return await cache.setIfAbsent(`passkey:used:${nonce}`, 1, PASSKEY_CHALLENGE_TTL_SECONDS);
  } catch (error) {
    // Same trade-off as the proof of work: the challenge still expires on its own and requests are rate limited.
    if (!CacheUnavailableError.is(error)) throw error;
    return true;
  }
}
