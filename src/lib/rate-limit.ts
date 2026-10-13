import { getCache, CacheUnavailableError, type Cache } from "@/lib/cache";

export type RateLimitPolicy = Readonly<{
  /** Part of the Redis key; also shows up in logs. */
  name: string;
  /** Maximum events allowed per window. */
  limit: number;
  windowSeconds: number;
}>;

export const RATE_LIMITS = {
  /** Every request to the identity endpoint, per IP (also covers challenge farming). */
  identityRequests: { name: "identity-requests", limit: 30, windowSeconds: 10 * 60 },
  /** New device identities minted, per IP. Returning devices don't count. */
  identityCreations: { name: "identity-creations", limit: 10, windowSeconds: 60 * 60 },
  /** Guess submissions, per player. A real game needs at most six per day. */
  guesses: { name: "guesses", limit: 30, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** When blocked, how long until the window resets. */
  retryAfterSeconds: number;
};

type RateLimitOptions = {
  cache?: Cache;
  /**
   * What to do when the cache backend is unavailable. Failing open (default) keeps the game playable during a
   * Redis outage; failing closed blocks everyone, which is rarely what you want for a game.
   */
  failOpen?: boolean;
};

const bucket = (policy: RateLimitPolicy, subject: string) => `rl:${policy.name}:${subject}`;

/** Fixed-window limiter: counts one event for `subject` and says whether it is within the policy. */
export async function consumeRateLimit(
  policy: RateLimitPolicy,
  subject: string,
  { cache = getCache(), failOpen = true }: RateLimitOptions = {},
): Promise<RateLimitResult> {
  try {
    const { count, ttlSeconds } = await cache.incr(bucket(policy, subject), policy.windowSeconds);
    const allowed = count <= policy.limit;
    return {
      allowed,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - count),
      retryAfterSeconds: allowed ? 0 : ttlSeconds,
    };
  } catch (error) {
    if (!CacheUnavailableError.is(error) || !failOpen) throw error;
    return { allowed: true, limit: policy.limit, remaining: policy.limit, retryAfterSeconds: 0 };
  }
}

export type RateLimitUsage = {
  used: number;
  /** Seconds until the current window resets (0 if there is no active window). */
  resetsInSeconds: number;
};

/** Current usage of `subject` without counting a new event. Reports zero usage if it can't be read. */
export async function peekRateLimit(
  policy: RateLimitPolicy,
  subject: string,
  { cache = getCache() }: Pick<RateLimitOptions, "cache"> = {},
): Promise<RateLimitUsage> {
  const counter = await cache.getCounter(bucket(policy, subject));
  return { used: counter?.count ?? 0, resetsInSeconds: counter?.ttlSeconds ?? 0 };
}
