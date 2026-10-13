export const WORD_LENGTH = 5;
export const MAX_ATTEMPTS = 6;

export type TileState = "correct" | "present" | "absent";
export type GameStatus = "playing" | "won" | "lost";

const GUESS_PATTERN = new RegExp(`^[A-Z]{${WORD_LENGTH}}$`);

/** Uppercases and validates untrusted input; returns null when it is not a well-formed guess. */
export function normalizeGuess(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const guess = input.trim().toUpperCase();
  return GUESS_PATTERN.test(guess) ? guess : null;
}

/**
 * Scores a guess against the answer using Wordle's two-pass rules, which keeps
 * duplicate letters honest: a letter is only marked "present" as many times as
 * it still remains unmatched in the answer.
 */
export function evaluateGuess(guess: string, answer: string): TileState[] {
  const guessLetters = [...guess.toUpperCase()];
  const answerLetters = [...answer.toUpperCase()];
  const result: TileState[] = guessLetters.map(() => "absent");
  const remaining = new Map<string, number>();

  guessLetters.forEach((letter, i) => {
    if (letter === answerLetters[i]) {
      result[i] = "correct";
    } else {
      remaining.set(answerLetters[i], (remaining.get(answerLetters[i]) ?? 0) + 1);
    }
  });

  guessLetters.forEach((letter, i) => {
    if (result[i] === "correct") return;
    const count = remaining.get(letter) ?? 0;
    if (count > 0) {
      result[i] = "present";
      remaining.set(letter, count - 1);
    }
  });

  return result;
}

export function isWin(result: readonly TileState[]): boolean {
  return result.length === WORD_LENGTH && result.every((state) => state === "correct");
}

export function getGameStatus(results: readonly (readonly TileState[])[]): GameStatus {
  const last = results.at(-1);
  if (last && isWin(last)) return "won";
  return results.length >= MAX_ATTEMPTS ? "lost" : "playing";
}

const STATE_RANK: Record<TileState, number> = { absent: 0, present: 1, correct: 2 };

/** Best known state of every guessed letter, for colouring the on-screen keyboard. */
export function getKeyStates(
  guesses: readonly string[],
  results: readonly (readonly TileState[])[],
): Record<string, TileState> {
  const keys: Record<string, TileState> = {};
  guesses.forEach((guess, row) => {
    [...guess].forEach((letter, col) => {
      const next = results[row]?.[col];
      if (!next) return;
      const current = keys[letter];
      if (!current || STATE_RANK[next] > STATE_RANK[current]) keys[letter] = next;
    });
  });
  return keys;
}

const SHARE_EMOJI: Record<TileState, string> = {
  correct: "🟩",
  present: "🟨",
  absent: "⬛",
};

/** Spoiler-free emoji grid players can paste into chat. */
export function buildShareText(results: readonly (readonly TileState[])[], status: GameStatus): string {
  const score = status === "won" ? results.length : "X";
  const grid = results.map((row) => row.map((state) => SHARE_EMOJI[state]).join("")).join("\n");
  return `Guess the Word ${score}/${MAX_ATTEMPTS}\n\n${grid}`;
}
