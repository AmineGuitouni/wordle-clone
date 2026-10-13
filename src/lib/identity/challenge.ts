import { getCache, CacheUnavailableError, type Cache } from "@/lib/cache";
import { fromBase64Url, randomToken, sign, toBase64Url, verifySignature } from "./crypto";
import { checkProof } from "./pow";
import { CHALLENGE_TTL_SECONDS } from "./policy";

/**
 * Stateless, signed proof-of-work challenges: the server remembers nothing about an issued challenge. The token
 * carries salt, difficulty and expiry under an HMAC, so a client can neither lower the difficulty nor extend it.
 * The only server state is a short-lived "already used" marker that makes each challenge single-use.
 */
export type Challenge = {
  token: string;
  salt: string;
  difficulty: number;
  /** Epoch milliseconds. */
  expiresAt: number;
};

export type ChallengeFailure = "malformed" | "bad_signature" | "expired" | "bad_proof" | "replayed";

type Options = { now?: () => number; secret?: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function createChallenge(
  difficulty: number,
  { now = Date.now, secret }: Options = {},
): Promise<Challenge> {
  const salt = randomToken(16);
  const expiresAt = now() + CHALLENGE_TTL_SECONDS * 1000;
  const payload = toBase64Url(encoder.encode(JSON.stringify({ s: salt, d: difficulty, e: expiresAt })));
  return { token: `${payload}.${await sign("pow", payload, secret)}`, salt, difficulty, expiresAt };
}

function readPayload(payload: string): { salt: string; difficulty: number; expiresAt: number } | null {
  const bytes = fromBase64Url(payload);
  if (!bytes) return null;
  try {
    const { s, d, e } = JSON.parse(decoder.decode(bytes)) as Record<string, unknown>;
    if (typeof s !== "string" || !Number.isInteger(d) || typeof e !== "number") return null;
    return { salt: s, difficulty: d as number, expiresAt: e };
  } catch {
    return null;
  }
}

export async function verifyChallenge(
  token: unknown,
  nonce: unknown,
  { cache = getCache(), now = Date.now, secret }: Options & { cache?: Cache } = {},
): Promise<{ ok: true } | { ok: false; reason: ChallengeFailure }> {
  if (typeof token !== "string" || typeof nonce !== "number" || !Number.isSafeInteger(nonce) || nonce < 0) {
    return { ok: false, reason: "malformed" };
  }
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payload, signature] = parts;

  if (!(await verifySignature("pow", payload, signature, secret))) return { ok: false, reason: "bad_signature" };
  const challenge = readPayload(payload);
  if (!challenge) return { ok: false, reason: "malformed" };
  if (challenge.expiresAt <= now()) return { ok: false, reason: "expired" };
  if (!(await checkProof(challenge.salt, nonce, challenge.difficulty))) return { ok: false, reason: "bad_proof" };

  // Single use. Checked last so a wrong nonce doesn't burn the challenge.
  try {
    const firstUse = await cache.setIfAbsent(`pow:used:${challenge.salt}`, 1, CHALLENGE_TTL_SECONDS);
    if (!firstUse) return { ok: false, reason: "replayed" };
  } catch (error) {
    // Fail open on a cache outage: the challenge still expires on its own and issuance is rate limited per IP.
    if (!(error instanceof CacheUnavailableError)) throw error;
  }
  return { ok: true };
}
