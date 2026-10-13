/** Every extra attempt costs the same as this many milliseconds of solving time. */
const ATTEMPT_PENALTY_MS = 10_000;
const SCORE_SCALE = 1_000_000_000;

/** Higher is better: rewards solving in few guesses and in little time. */
export function calculateScore(tries: number, timeMs: number): number {
  return Math.floor(SCORE_SCALE / (timeMs + ATTEMPT_PENALTY_MS * tries));
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
