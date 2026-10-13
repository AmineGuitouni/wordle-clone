import "server-only";
import {
  MongoClient,
  MongoServerError,
  type AnyBulkWriteOperation,
  type Binary,
  type Collection,
  type Db,
  type ObjectId,
} from "mongodb";

/**
 * One round of the game: a secret answer and when it went live. The newest document is the current round. The same
 * word can come back in a later round, so games point at the round, never just at the word.
 */
export type WordDocument = {
  word: string;
  createdAt: Date;
};

/** One player's attempt at one round. */
export type GameDocument = {
  _id: ObjectId;
  userId: string;
  /** Display name captured when the game starts (guests have no user record). */
  name?: string;
  /**
   * The round (WordDocument `_id`) this game was played in. Missing only on games saved before rounds were tracked,
   * until `linkGamesToRounds` fills it in.
   */
  roundId?: ObjectId;
  /** The answer, kept so a game is readable on its own and so older games can be linked to their round. */
  toDaysWord: string;
  words: string[];
  createdAt: Date;
  finishedAt: Date | null;
  /** Absent on games saved before wins and losses were tracked separately. */
  won?: boolean;
  /** `false` for a provisional win that doesn't count on the leaderboard. Absent on older games (ranked). */
  ranked?: boolean;
  /** Keyed hash of the player's network for this word only (see `networkKey`); never the raw IP. */
  networkKey?: string;
};

/**
 * A device identity (see lib/identity). Created when the identity is minted; identities minted before this
 * collection existed have no document and count as long established.
 */
export type IdentityDocument = {
  _id: string;
  /** The latest display name, so a passkey sign-in on another device can restore it. */
  name: string;
  createdAt: Date;
  lastSeenAt: Date;
};

/** A WebAuthn credential that can sign a device back into its identity, on this or another device. */
export type PasskeyDocument = {
  /** The credential id (base64url). */
  _id: string;
  userId: string;
  publicKey: Binary;
  counter: number;
  transports: string[];
  /** "multiDevice" when it is synced (iCloud Keychain, Google Password Manager, ...). */
  deviceType: string;
  backedUp: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
};

const globalForMongo = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
  mongoIndexesPromise?: Promise<void>;
};

function requireEnv(name: "MONGODB_URI" | "MONGODB_DB"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

// Connect lazily so importing this module never needs the environment (e.g. during `next build`),
// and cache on globalThis so dev hot reloads don't leak connections.
function getClient(): Promise<MongoClient> {
  if (!globalForMongo.mongoClientPromise) {
    const promise = new MongoClient(requireEnv("MONGODB_URI"), { appName: "guess-the-word" }).connect();
    promise.catch(() => {
      // Don't cache a failed connection forever; the next request retries.
      globalForMongo.mongoClientPromise = undefined;
    });
    globalForMongo.mongoClientPromise = promise;
  }
  return globalForMongo.mongoClientPromise;
}

const DUPLICATE_KEY_ERROR = 11000;
const NAMESPACE_NOT_FOUND = 26;
const INDEX_NOT_FOUND = 27;

/** Indexes from when games were keyed by word: the unique one made a returning word collide with old games. */
const RETIRED_GAME_INDEXES = ["userId_1_toDaysWord_1", "toDaysWord_1_finishedAt_1"];

/**
 * Games saved before rounds were tracked only name their word. Links each one to the round it was played in: the
 * latest round with that word that had started when the game began. Resolves to how many games it linked.
 */
export async function linkGamesToRounds(db: Db): Promise<number> {
  const games = db.collection<GameDocument>("users-history");
  const unlinked = await games
    .find({ roundId: { $exists: false } }, { projection: { toDaysWord: 1, createdAt: 1 } })
    .toArray();
  if (unlinked.length === 0) return 0;

  const rounds = await db
    .collection<WordDocument>("words")
    .find({}, { projection: { word: 1, createdAt: 1 }, sort: { createdAt: 1 } })
    .toArray();

  const updates: AnyBulkWriteOperation<GameDocument>[] = unlinked.flatMap((game) => {
    const sameWord = rounds.filter((round) => round.word === game.toDaysWord);
    const round = sameWord.filter((candidate) => candidate.createdAt <= game.createdAt).at(-1) ?? sameWord[0];
    if (!round) return []; // its word is gone: nothing to link to
    return [
      {
        updateOne: {
          filter: { _id: game._id, roundId: { $exists: false } },
          update: { $set: { roundId: round._id } },
        },
      },
    ];
  });
  if (updates.length === 0) return 0;

  try {
    await games.bulkWrite(updates, { ordered: false });
  } catch (error) {
    // A player who already has a game in that round keeps it; the conflicting older game just stays unlinked.
    if (!(error instanceof MongoServerError && error.code === DUPLICATE_KEY_ERROR)) throw error;
  }
  return updates.length;
}

function ignoreMissing(error: unknown): void {
  if (error instanceof MongoServerError && [NAMESPACE_NOT_FOUND, INDEX_NOT_FOUND].includes(error.code as number))
    return;
  throw error;
}

/**
 * Brings a database up to date: links older games to their rounds, retires indexes that keyed games by word, and
 * creates the current indexes. Idempotent, so every process runs it before its first query. Steps fail
 * independently: a failure is logged and the app keeps serving requests.
 */
export async function prepareDatabase(db: Db): Promise<void> {
  const games = db.collection<GameDocument>("users-history");

  const step = async (name: string, run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      console.error(`Database setup: could not ${name}`, error);
    }
  };

  await step("link games to rounds", () => linkGamesToRounds(db));
  await step("drop retired indexes", () =>
    Promise.all(RETIRED_GAME_INDEXES.map((name) => games.dropIndex(name).catch(ignoreMissing))),
  );
  await step("create indexes", () =>
    Promise.all([
      db.collection<WordDocument>("words").createIndex({ createdAt: -1 }),
      // A player has at most one game per round; this also makes concurrent first guesses safe.
      games.createIndex(
        { userId: 1, roundId: 1 },
        { unique: true, partialFilterExpression: { roundId: { $exists: true } } },
      ),
      // Leaderboards, and finding games that still need linking (missing roundId).
      games.createIndex({ roundId: 1, finishedAt: 1 }),
      games.createIndex({ networkKey: 1 }, { partialFilterExpression: { networkKey: { $exists: true } } }),
      db.collection<PasskeyDocument>("passkeys").createIndex({ userId: 1 }),
    ]),
  );
}

export async function getDb(): Promise<Db> {
  const db = (await getClient()).db(requireEnv("MONGODB_DB"));
  globalForMongo.mongoIndexesPromise ??= prepareDatabase(db);
  await globalForMongo.mongoIndexesPromise;
  return db;
}

export async function getCollections(): Promise<{
  words: Collection<WordDocument>;
  games: Collection<GameDocument>;
  identities: Collection<IdentityDocument>;
  passkeys: Collection<PasskeyDocument>;
}> {
  const db = await getDb();
  return {
    words: db.collection<WordDocument>("words"),
    games: db.collection<GameDocument>("users-history"),
    identities: db.collection<IdentityDocument>("identities"),
    passkeys: db.collection<PasskeyDocument>("passkeys"),
  };
}
