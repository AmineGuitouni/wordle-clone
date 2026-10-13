import "server-only";
import { MongoServerError, ObjectId } from "mongodb";
import type { UpdateFilter } from "mongodb";
import { getCache } from "@/lib/cache";
import { getCollections, type GameDocument } from "@/lib/db";
import { sign } from "@/lib/identity/crypto";
import { networkOf } from "@/lib/request";
import { provisionalReason, type ProvisionalReason } from "./ranking";
import { evaluateGuess, getGameStatus } from "./rules";
import { calculateScore } from "./score";
import type { GameView, GuessResult, LeaderboardEntry } from "./types";
import { pickRandomWord } from "./words";

const DUPLICATE_KEY_ERROR = 11000;

/** Cache keys and lifetimes. Writers that change the underlying data delete the matching key. */
export const CACHE_KEYS = {
  todaysRound: "round:current",
  leaderboard: (round: Pick<Round, "id">) => `leaderboard:${round.id.toHexString()}`,
} as const;
const WORD_CACHE_TTL_SECONDS = 60;
const LEADERBOARD_CACHE_TTL_SECONDS = 15;
const LEADERBOARD_CACHE_SIZE = 50;

/**
 * Today's round: the answer and the moment it went live. Words can come back on a later day, so everything that
 * belongs to a day (games, leaderboards, network keys) is keyed by the round id, never by the word.
 */
export type Round = { id: ObjectId; word: string; startedAt: Date };

/** A Round as cached (JSON): ids as hex strings, dates as epoch ms. */
type CachedRound = { id: string; word: string; startedAt: number };

/** The newest word document is today's round. Cached briefly, since every page view and guess needs it. */
export async function getTodaysRound(): Promise<Round> {
  const { id, word, startedAt } = await getCache().getOrSet(
    CACHE_KEYS.todaysRound,
    WORD_CACHE_TTL_SECONDS,
    loadTodaysRound,
  );
  return { id: new ObjectId(id), word, startedAt: new Date(startedAt) };
}

export async function getTodaysWord(): Promise<string> {
  return (await getTodaysRound()).word;
}

/** A fresh deployment is seeded so it is playable before the cron fires. */
async function loadTodaysRound(): Promise<CachedRound> {
  const { words } = await getCollections();
  const latest = await words.findOne({}, { sort: { createdAt: -1 } });
  if (latest) return { id: latest._id.toHexString(), word: latest.word, startedAt: latest.createdAt.getTime() };

  // Upserting on an empty filter inserts only when the collection is empty, so racing requests converge.
  const seeded = await words.findOneAndUpdate(
    {},
    { $setOnInsert: { word: pickRandomWord(), createdAt: new Date() } },
    { upsert: true, returnDocument: "after", sort: { createdAt: -1 } },
  );
  if (!seeded) throw new Error("Could not seed today's word");
  return { id: seeded._id.toHexString(), word: seeded.word, startedAt: seeded.createdAt.getTime() };
}

/**
 * Starts a new round (called by the scheduled webhook). Its word is never the previous one and, until the word
 * list runs out, one that has never been used.
 */
export async function rotateTodaysWord(): Promise<void> {
  const { words } = await getCollections();
  const [latest, used] = await Promise.all([
    words.findOne({}, { sort: { createdAt: -1 }, projection: { word: 1 } }),
    words.distinct("word"),
  ]);
  await words.insertOne({ word: pickRandomWord(latest?.word, new Set(used)), createdAt: new Date() });
  await getCache().del(CACHE_KEYS.todaysRound);
}

export function buildGameView(
  guesses: readonly string[],
  answer: string,
  { provisional = false }: { provisional?: boolean } = {},
): GameView {
  const normalized = guesses.map((guess) => guess.toUpperCase());
  const results = normalized.map((guess) => evaluateGuess(guess, answer));
  const status = getGameStatus(results);
  return {
    guesses: normalized,
    results,
    status,
    answer: status === "lost" ? answer.toUpperCase() : null,
    provisional: status === "won" && provisional,
  };
}

const isProvisional = (game: Pick<GameDocument, "won" | "ranked"> | null) =>
  game?.won === true && game.ranked === false;

export async function getGameView(userId: string, round: Round): Promise<GameView> {
  const { games } = await getCollections();
  const game = await games.findOne({ userId, roundId: round.id });
  return buildGameView(game?.words ?? [], round.word, { provisional: isProvisional(game) });
}

async function getOrCreateGame(userId: string, name: string, round: Round): Promise<GameDocument> {
  const { games } = await getCollections();
  try {
    const game = await games.findOneAndUpdate(
      { userId, roundId: round.id },
      { $setOnInsert: { name, toDaysWord: round.word, words: [], createdAt: new Date(), finishedAt: null } },
      { upsert: true, returnDocument: "after" },
    );
    if (game) return game;
  } catch (error) {
    // Two first guesses racing: the unique index lets one insert win, so read what it created.
    if (!(error instanceof MongoServerError && error.code === DUPLICATE_KEY_ERROR)) throw error;
  }

  const existing = await games.findOne({ userId, roundId: round.id });
  if (!existing) throw new Error("Could not create game");
  return existing;
}

/**
 * Identifies "the same network, in this round" without storing an IP: an HMAC of the network (IPv4 address or
 * IPv6 /64) and the round id. Keys from different rounds can't be linked, and none can be reversed.
 */
export async function networkKey(ip: string, round: Pick<Round, "id">): Promise<string | null> {
  const network = networkOf(ip);
  return network ? sign("network", `${round.id.toHexString()}|${network}`) : null;
}

/** Gathers the facts `provisionalReason` needs. Runs only when a game is won. */
async function checkRanking(userId: string, round: Round, network: string | null): Promise<ProvisionalReason | null> {
  const { identities, games } = await getCollections();
  const [identity, earlierGame, sameNetwork] = await Promise.all([
    identities.findOne({ _id: userId }, { projection: { createdAt: 1 } }),
    games.findOne({ userId, roundId: { $ne: round.id }, finishedAt: { $ne: null } }, { projection: { _id: 1 } }),
    network
      ? games.findOne(
          { networkKey: network, userId: { $ne: userId }, finishedAt: { $ne: null } },
          { projection: { _id: 1 } },
        )
      : null,
  ]);

  return provisionalReason({
    identityCreatedAt: identity?.createdAt ?? null,
    wordStartedAt: round.startedAt,
    hasFinishedBefore: earlierGame !== null,
    networkAlreadyFinished: sameNetwork !== null,
  });
}

/**
 * Validates a guess against the rules and persists it.
 * The write is a compare-and-set on the number of guesses already stored, so concurrent or replayed
 * requests can neither skip past the attempt limit nor overwrite each other.
 * `ip` (when known) only feeds the keyed network hash used by the ranking rules; it is never stored.
 */
export async function submitGuess(input: {
  userId: string;
  name: string;
  guess: string;
  ip?: string | null;
}): Promise<GuessResult> {
  const round = await getTodaysRound();
  const answer = round.word;
  const game = await getOrCreateGame(input.userId, input.name, round);

  const previous = buildGameView(game.words, answer);
  if (game.finishedAt || previous.status !== "playing") {
    return { ok: false, error: "game_over" };
  }

  const result = evaluateGuess(input.guess, answer);
  const status = getGameStatus([...previous.results, result]);

  const update: UpdateFilter<GameDocument> = { $push: { words: input.guess } };
  let provisional = false;
  if (status !== "playing") {
    const finishedAt = new Date(); // taken before the ranking lookups, so they never count against the player
    const network = input.ip ? await networkKey(input.ip, round) : null;
    const set: Partial<GameDocument> = { finishedAt, won: status === "won" };
    if (network) set.networkKey = network;
    if (status === "won") {
      provisional = (await checkRanking(input.userId, round, network)) !== null;
      set.ranked = !provisional;
    }
    update.$set = set;
  }

  const { games } = await getCollections();
  const written = await games.updateOne(
    { _id: game._id, finishedAt: null, words: { $size: game.words.length } },
    update,
  );
  if (written.modifiedCount === 0) {
    return { ok: false, error: "out_of_sync" };
  }

  if (status === "won" && !provisional) await getCache().del(CACHE_KEYS.leaderboard(round));

  return {
    ok: true,
    result,
    status,
    answer: status === "lost" ? answer.toUpperCase() : null,
    provisional,
  };
}

/** Updates a player's display name everywhere it is shown. Their identity (and games) stay the same. */
export async function renamePlayer(userId: string, name: string): Promise<void> {
  const { games } = await getCollections();
  const { modifiedCount } = await games.updateMany({ userId, name: { $ne: name } }, { $set: { name } });
  if (modifiedCount > 0) {
    await getCache().del(CACHE_KEYS.leaderboard(await getTodaysRound()));
  }
}

type ScoredGame = { userId: string; name: string; tries: number; timeMs: number; score: number };

function scoreGame(game: Pick<GameDocument, "userId" | "name" | "words" | "createdAt" | "finishedAt">): ScoredGame[] {
  if (!game.finishedAt) return [];
  const tries = game.words.length;
  const timeMs = game.finishedAt.getTime() - game.createdAt.getTime();
  return [{ userId: game.userId, name: game.name ?? "Guest", tries, timeMs, score: calculateScore(tries, timeMs) }];
}

const SCORE_PROJECTION = { userId: 1, name: 1, words: 1, createdAt: 1, finishedAt: 1 } as const;

async function rankSolvedGames(round: Round, limit: number): Promise<ScoredGame[]> {
  const { games } = await getCollections();
  // `won` is missing on games saved before losses were tracked; those only ever had a finishedAt when won.
  // `ranked: false` marks provisional wins; older games have no flag and count.
  const solved = await games
    .find(
      { roundId: round.id, finishedAt: { $ne: null }, won: { $ne: false }, ranked: { $ne: false } },
      { projection: SCORE_PROJECTION },
    )
    .toArray();

  return solved
    .flatMap(scoreGame)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Today's fastest solvers, best score first. The ranking is cached for a few seconds (and dropped as soon as a
 * ranked game is won or a name changes); only the viewer's own details are computed on each call. A viewer whose
 * win is provisional also sees it, marked, at the place it would have taken; nobody else sees it.
 */
export async function getLeaderboard(round: Round, currentUserId?: string, limit = 10): Promise<LeaderboardEntry[]> {
  const ranked =
    limit <= LEADERBOARD_CACHE_SIZE
      ? await getCache().getOrSet(CACHE_KEYS.leaderboard(round), LEADERBOARD_CACHE_TTL_SECONDS, () =>
          rankSolvedGames(round, LEADERBOARD_CACHE_SIZE),
        )
      : await rankSolvedGames(round, limit);

  const entries: LeaderboardEntry[] = ranked.slice(0, limit).map((game, index) => ({
    ...publicFields(game),
    rank: index + 1,
    provisional: false,
    isCurrentUser: game.userId === currentUserId,
  }));
  if (!currentUserId) return entries;

  const { games } = await getCollections();
  const own = await games.findOne(
    { userId: currentUserId, roundId: round.id, won: true, ranked: false },
    { projection: SCORE_PROJECTION },
  );
  const [scored] = own ? scoreGame(own) : [];
  if (!scored) return entries;

  const better = ranked.filter((other) => other.score > scored.score).length;
  // Behind every entry of a list that was cut off, its true place is unknown.
  const listIsComplete = ranked.length < Math.max(limit, LEADERBOARD_CACHE_SIZE);
  const rank = better < ranked.length || listIsComplete ? better + 1 : null;
  entries.splice(Math.min(better, entries.length), 0, {
    ...publicFields(scored),
    rank,
    provisional: true,
    isCurrentUser: true,
  });
  return entries;
}

/** The internal user id (a device identity) is deliberately not exposed to other players. */
function publicFields({ name, tries, timeMs, score }: ScoredGame) {
  return { name, tries, timeMs, score };
}
