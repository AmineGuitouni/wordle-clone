import "server-only";
import { renamePlayer } from "@/lib/game/service";
import { consumeRateLimit, peekRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { normalizeGuestName } from "@/lib/validation";
import { createChallenge, verifyChallenge, type Challenge, type ChallengeFailure } from "./challenge";
import { createDeviceId, readDeviceId } from "./device";
import { difficultyFor } from "./policy";

export type IdentityResult =
  | { kind: "identified"; deviceId: string; isNew: boolean }
  | { kind: "challenge_required"; challenge: Challenge }
  | { kind: "invalid_name" }
  | { kind: "invalid_challenge"; reason: ChallengeFailure }
  | { kind: "rate_limited"; retryAfterSeconds: number };

type IdentityBody = { name?: unknown; challenge?: { token?: unknown; nonce?: unknown } };

function readBody(body: unknown): IdentityBody {
  return typeof body === "object" && body !== null ? (body as IdentityBody) : {};
}

/**
 * Decides whether a visitor already has an identity or must earn one.
 *
 * - A valid signed device cookie means "returning device": no challenge, just update the display name.
 * - Otherwise the visitor must solve a proof-of-work whose difficulty rises with how many identities this IP
 *   created recently; solving it (once) mints a brand-new device id, subject to a per-IP creation limit.
 *
 * The route turns the result into a response and sets the cookie; this function holds no HTTP details.
 */
export async function issueIdentity({ headers, body }: { headers: Headers; body: unknown }): Promise<IdentityResult> {
  const ip = getClientIp(headers);
  const { name: rawName, challenge: submitted } = readBody(body);

  if (ip) {
    const requests = await consumeRateLimit(RATE_LIMITS.identityRequests, ip);
    if (!requests.allowed) return { kind: "rate_limited", retryAfterSeconds: requests.retryAfterSeconds };
  }

  const name = normalizeGuestName(rawName);
  if (!name) return { kind: "invalid_name" };

  const existing = await readDeviceId(headers.get("cookie"));
  if (existing) {
    await renamePlayer(existing, name);
    return { kind: "identified", deviceId: existing, isNew: false };
  }

  // A new device: it has to prove some work first. No IP means no per-IP accounting (e.g. local development).
  const recent = ip ? await peekRateLimit(RATE_LIMITS.identityCreations, ip) : { used: 0, resetsInSeconds: 0 };
  if (ip && recent.used >= RATE_LIMITS.identityCreations.limit) {
    return { kind: "rate_limited", retryAfterSeconds: recent.resetsInSeconds };
  }

  if (!submitted) {
    return { kind: "challenge_required", challenge: await createChallenge(difficultyFor(recent.used)) };
  }

  const verification = await verifyChallenge(submitted.token, submitted.nonce);
  if (!verification.ok) return { kind: "invalid_challenge", reason: verification.reason };

  if (ip) {
    const creations = await consumeRateLimit(RATE_LIMITS.identityCreations, ip);
    if (!creations.allowed) return { kind: "rate_limited", retryAfterSeconds: creations.retryAfterSeconds };
  }

  return { kind: "identified", deviceId: createDeviceId(), isNew: true };
}
