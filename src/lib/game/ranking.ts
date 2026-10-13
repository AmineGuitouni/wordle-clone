/**
 * Who counts on the leaderboard. A device identity is just a cookie, so anyone can make a fresh one; these rules
 * make doing that pointless for climbing the board, without asking players for an email or anything else.
 *
 * A win is provisional (shown to its player, but not ranked) when either:
 * - **the identity is newer than the word.** "Lose, clear cookies, try again with what you learned" yields a
 *   brand-new identity, which therefore can't rank on the word that is already live; or
 * - **a spare identity on a shared network.** The identity has never finished a game before, and another identity
 *   on the same network has already finished this word. Regulars build up history, so two regulars sharing a
 *   coffee shop or a mobile carrier's address both rank; an identity created in advance and kept unused does not.
 */
export type RankingFacts = {
  /** When the identity was minted; null for identities that predate tracking (treated as established). */
  identityCreatedAt: Date | null;
  /** When the current word went live. */
  wordStartedAt: Date;
  /** Whether this identity finished any earlier word. */
  hasFinishedBefore: boolean;
  /** Whether a different identity on the same network already finished this word. */
  networkAlreadyFinished: boolean;
};

export type ProvisionalReason = "new_identity" | "shared_network";

/** Null when the win is ranked, otherwise why it is provisional. */
export function provisionalReason(facts: RankingFacts): ProvisionalReason | null {
  if (facts.identityCreatedAt && facts.identityCreatedAt.getTime() > facts.wordStartedAt.getTime()) {
    return "new_identity";
  }
  if (!facts.hasFinishedBefore && facts.networkAlreadyFinished) return "shared_network";
  return null;
}
