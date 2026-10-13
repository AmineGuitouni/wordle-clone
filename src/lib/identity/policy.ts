/** How long a challenge stays valid after being issued. */
export const CHALLENGE_TTL_SECONDS = 5 * 60;

const DEFAULT_BASE_DIFFICULTY_BITS = 16; // ~65k hashes: well under a second in a browser worker
const MAX_ESCALATION_BITS = 6;
const MAX_CONFIGURABLE_BITS = 28;

/** Base difficulty; tune it with POW_DIFFICULTY_BITS without redeploying code (tests use a tiny value). */
export function baseDifficultyBits(): number {
  const configured = Number(process.env.POW_DIFFICULTY_BITS);
  return Number.isInteger(configured) && configured >= 0 && configured <= MAX_CONFIGURABLE_BITS
    ? configured
    : DEFAULT_BASE_DIFFICULTY_BITS;
}

/**
 * Each identity recently created from the same IP makes the next challenge twice as hard (up to 2^6 times),
 * so creating identities in bulk gets expensive fast while a normal player never notices.
 */
export function difficultyFor(recentlyCreated: number, base = baseDifficultyBits()): number {
  return base + Math.min(Math.max(0, recentlyCreated), MAX_ESCALATION_BITS);
}
