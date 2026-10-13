export type ChallengeDto = { token: string; salt: string; difficulty: number };

export type IdentityOutcome =
  { ok: true } | { ok: false; error: "invalid_name" | "rate_limited" | "failed"; retryAfterSeconds?: number };

type Hooks = {
  /** Finds a nonce for a challenge. Injected so the flow can be tested without real hashing. */
  solve: (challenge: ChallengeDto) => Promise<number>;
  /** Called when the server asks for a proof of work, so the UI can show progress. */
  onChallenge?: () => void;
};

/** A solution can legitimately be rejected once (e.g. it expired while the tab was in the background). */
const MAX_CHALLENGES = 2;
/** Hard stop so a misbehaving server can never make the client loop. */
const MAX_REQUESTS = 6;

/**
 * Talks to POST /api/identity: a returning device succeeds immediately; a new one is handed a challenge, solves
 * it, and repeats the request with the solution. A rejected solution (expired, reused) restarts from scratch.
 */
export async function establishIdentity(name: string, { solve, onChallenge }: Hooks): Promise<IdentityOutcome> {
  let solution: { token: string; nonce: number } | undefined;
  let challenges = 0;

  for (let request = 0; request < MAX_REQUESTS; request++) {
    let response: Response;
    try {
      response = await fetch("/api/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, challenge: solution }),
      });
    } catch {
      return { ok: false, error: "failed" };
    }

    const data = (await response.json().catch(() => ({}))) as {
      status?: "ok" | "challenge_required";
      error?: string;
      challenge?: ChallengeDto;
      retryAfterSeconds?: number;
    };

    if (response.ok && data.status === "ok") return { ok: true };

    if (response.ok && data.status === "challenge_required" && data.challenge) {
      if (++challenges > MAX_CHALLENGES) return { ok: false, error: "failed" };
      onChallenge?.();
      const nonce = await solve(data.challenge);
      solution = { token: data.challenge.token, nonce };
    } else if (response.status === 429) {
      return { ok: false, error: "rate_limited", retryAfterSeconds: data.retryAfterSeconds };
    } else if (data.error === "invalid_name") {
      return { ok: false, error: "invalid_name" };
    } else if (data.error === "invalid_challenge") {
      solution = undefined; // start over with a fresh challenge
    } else {
      return { ok: false, error: "failed" };
    }
  }

  return { ok: false, error: "failed" };
}
