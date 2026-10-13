import type { GameStatus, TileState } from "./rules";

/** Everything the client needs to render a game; never contains the answer while it is still in play. */
export type GameView = {
  guesses: string[];
  results: TileState[][];
  status: GameStatus;
  /** Only revealed once the player has lost. */
  answer: string | null;
  /** A win that is shown to its player but doesn't count on the leaderboard (see lib/game/ranking). */
  provisional: boolean;
};

export type GuessError =
  "unauthenticated" | "rate_limited" | "invalid_word" | "game_over" | "out_of_sync" | "server_error";

export type GuessResult =
  | { ok: true; result: TileState[]; status: GameStatus; answer: string | null; provisional: boolean }
  | { ok: false; error: GuessError };

export type LeaderboardEntry = {
  /** Position on the board. For a provisional entry, where it would place; null if that is past the top list. */
  rank: number | null;
  name: string;
  tries: number;
  timeMs: number;
  score: number;
  isCurrentUser: boolean;
  /** Only ever the viewer's own entry: other players' provisional wins are not shown. */
  provisional: boolean;
};
