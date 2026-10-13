import "server-only";
import { MongoServerError } from "mongodb";
import type { UpdateFilter } from "mongodb";
import { getCache } from "@/lib/cache";
import { getCollections, type GameDocument } from "@/lib/db";
import { evaluateGuess, getGameStatus } from "./rules";
import { calculateScore } from "./score";
import type { GameView, GuessResult, LeaderboardEntry } from "./types";
import { pickRandomWord } from "./words";

const DUPLICATE_KEY_ERROR = 11000;

/** Cache keys and lifetimes. Writers that change the underlying data delete the matching key. */
export const CACHE_KEYS = {
  todaysWord: "word:today",
  leaderboard: (word: string) => `leaderboard:${word}`,
} as const;
const WORD_CACHE_TTL_SECONDS = 60;
const LEADERBOARD_CACHE_TTL_SECONDS = 15;
const LEADERBOARD_CACHE_SIZE = 50;

/** The newest word is today's word. Cached briefly, since every page view and guess needs it. */
export function getTodaysWord(): Promise<string> {
  return getCache().getOrSet(CACHE_KEYS.todaysWord, WORD_CACHE_TTL_SECONDS, loadTodaysWord);
}

/** A fresh deployment is seeded so it is playable before the cron fires. */
async function loadTodaysWord(): Promise<string> {
  const { words } = await getCollections();
  const latest = await words.findOne({}, { sort: { createdAt: -1 } });
  if (latest) return latest.word;

  // Upserting on an empty filter inserts only when the collection is empty, so racing requests converge.
  const seeded = await words.findOneAndUpdate(
    {},
    { $setOnInsert: { word: pickRandomWord(), createdAt: new Date() } },
    { upsert: true, returnDocument: "after", sort: { createdAt: -1 } },
  );
  if (!seeded) throw new Error("Could not seed today's word");
  return seeded.word;
}

/** Starts a new "today's word" (called by the scheduled webhook), never repeating the previous one. */
export async function rotateTodaysWord(): Promise<void> {
  const { words } = await getCollections();
  const latest = await words.findOne({}, { sort: { createdAt: -1 } });
  await words.insertOne({ word: pickRandomWord(latest?.word), createdAt: new Date() });
  await getCache().del(CACHE_KEYS.todaysWord);
}

export function buildGameView(guesses: readonly string[], answer: string): GameView {
  const normalized = guesses.map((guess) => guess.toUpperCase());
  const results = normalized.map((guess) => evaluateGuess(guess, answer));
  const status = getGameStatus(results);
  return {
    guesses: normalized,
    results,
    status,
    answer: status === "lost" ? answer.toUpperCase() : null,
  };
}

export async function getGameView(userId: string, answer: string): Promise<GameView> {
  const { games } = await getCollections();
  const game = await games.findOne({ userId, toDaysWord: answer });
  return buildGameView(game?.words ?? [], answer);
}

async function getOrCreateGame(userId: string, name: string, answer: string): Promise<GameDocument> {
  const { games } = await getCollections();
  try {
    const game = await games.findOneAndUpdate(
      { userId, toDaysWord: answer },
      { $setOnInsert: { name, words: [], createdAt: new Date(), finishedAt: null } },
      { upsert: true, returnDocument: "after" },
    );
    if (game) return game;
  } catch (error) {
    // Two first guesses racing: the unique index lets one insert win, so read what it created.
    if (!(error instanceof MongoServerError && error.code === DUPLICATE_KEY_ERROR)) throw error;
  }

  const existing = await games.findOne({ userId, toDaysWord: answer });
  if (!existing) throw new Error("Could not create game");
  return existing;
}

/**
 * Validates a guess against the rules and persists it.
 * The write is a compare-and-set on the number of guesses already stored, so concurrent or replayed
 * requests can neither skip past the attempt limit nor overwrite each other.
 */
export async function submitGuess(input: { userId: string; name: string; guess: string }): Promise<GuessResult> {
  const answer = await getTodaysWord();
  const game = await getOrCreateGame(input.userId, input.name, answer);

  const previous = buildGameView(game.words, answer);
  if (game.finishedAt || previous.status !== "playing") {
    return { ok: false, error: "game_over" };
  }

  const result = evaluateGuess(input.guess, answer);
  const status = getGameStatus([...previous.results, result]);

  const update: UpdateFilter<GameDocument> = { $push: { words: input.guess } };
  if (status !== "playing") {
    update.$set = { finishedAt: new Date(), won: status === "won" };
  }

  const { games } = await getCollections();
  const written = await games.updateOne(
    { _id: game._id, finishedAt: null, words: { $size: game.words.length } },
    update,
  );
  if (written.modifiedCount === 0) {
    return { ok: false, error: "out_of_sync" };
  }

  if (status === "won") await getCache().del(CACHE_KEYS.leaderboard(answer));

  return {
    ok: true,
    result,
    status,
    answer: status === "lost" ? answer.toUpperCase() : null,
  };
}

/** Updates a player's display name everywhere it is shown. Their identity (and games) stay the same. */
export async function renamePlayer(userId: string, name: string): Promise<void> {
  const { games } = await getCollections();
  const { modifiedCount } = await games.updateMany({ userId, name: { $ne: name } }, { $set: { name } });
  if (modifiedCount > 0) {
    await getCache().del(CACHE_KEYS.leaderboard(await getTodaysWord()));
  }
}

type RankedPlayer = Omit<LeaderboardEntry, "isCurrentUser"> & { userId: string };

async function rankSolvedGames(answer: string, limit: number): Promise<RankedPlayer[]> {
  const { games } = await getCollections();
  // `won` is missing on games saved before losses were tracked; those only ever had a finishedAt when won.
  const solved = await games
    .find(
      { toDaysWord: answer, finishedAt: { $ne: null }, won: { $ne: false } },
      { projection: { userId: 1, name: 1, words: 1, createdAt: 1, finishedAt: 1 } },
    )
    .toArray();

  return solved
    .flatMap((game) => {
      if (!game.finishedAt) return [];
      const tries = game.words.length;
      const timeMs = game.finishedAt.getTime() - game.createdAt.getTime();
      return [{ userId: game.userId, name: game.name ?? "Guest", tries, timeMs, score: calculateScore(tries, timeMs) }];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Today's fastest solvers, best score first. The ranking is cached for a few seconds (and dropped as soon as a
 * game is won or a name changes); only the per-viewer "isCurrentUser" flag is computed on each call.
 */
export async function getLeaderboard(answer: string, currentUserId?: string, limit = 10): Promise<LeaderboardEntry[]> {
  const ranked =
    limit <= LEADERBOARD_CACHE_SIZE
      ? await getCache().getOrSet(CACHE_KEYS.leaderboard(answer), LEADERBOARD_CACHE_TTL_SECONDS, () =>
          rankSolvedGames(answer, LEADERBOARD_CACHE_SIZE),
        )
      : await rankSolvedGames(answer, limit);

  // The internal user id (a device identity) is deliberately not exposed to other players.
  return ranked.slice(0, limit).map(({ userId, ...entry }) => ({ ...entry, isCurrentUser: userId === currentUserId }));
}
