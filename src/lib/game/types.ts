import type { GameStatus, TileState } from "./rules";

/** Everything the client needs to render a game; never contains the answer while it is still in play. */
export type GameView = {
  guesses: string[];
  results: TileState[][];
  status: GameStatus;
  /** Only revealed once the player has lost. */
  answer: string | null;
};

export type GuessError =
  "unauthenticated" | "rate_limited" | "invalid_word" | "game_over" | "out_of_sync" | "server_error";

export type GuessResult =
  { ok: true; result: TileState[]; status: GameStatus; answer: string | null } | { ok: false; error: GuessError };

export type LeaderboardEntry = {
  name: string;
  tries: number;
  timeMs: number;
  score: number;
  isCurrentUser: boolean;
};
