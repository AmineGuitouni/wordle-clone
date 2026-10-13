import "server-only";
import { MongoClient, type Collection, type Db, type ObjectId } from "mongodb";

/** The secret answer for a day. The newest document is "today's word". */
export type WordDocument = {
  word: string;
  createdAt: Date;
};

/** One player's attempt at one daily word. `toDaysWord` ties it to a WordDocument. */
export type GameDocument = {
  _id: ObjectId;
  userId: string;
  /** Display name captured when the game starts (guests have no user record). */
  name?: string;
  toDaysWord: string;
  words: string[];
  createdAt: Date;
  finishedAt: Date | null;
  /** Absent on games saved before wins and losses were tracked separately. */
  won?: boolean;
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

async function ensureIndexes(db: Db): Promise<void> {
  try {
    await Promise.all([
      db.collection<WordDocument>("words").createIndex({ createdAt: -1 }),
      // A player has at most one game per word; this also makes concurrent first guesses safe.
      db.collection<GameDocument>("users-history").createIndex({ userId: 1, toDaysWord: 1 }, { unique: true }),
      db.collection<GameDocument>("users-history").createIndex({ toDaysWord: 1, finishedAt: 1 }),
    ]);
  } catch (error) {
    // Legacy data may violate the unique index. Serving requests matters more than failing hard.
    console.error("Failed to create MongoDB indexes", error);
  }
}

export async function getDb(): Promise<Db> {
  const db = (await getClient()).db(requireEnv("MONGODB_DB"));
  globalForMongo.mongoIndexesPromise ??= ensureIndexes(db);
  await globalForMongo.mongoIndexesPromise;
  return db;
}

export async function getCollections(): Promise<{
  words: Collection<WordDocument>;
  games: Collection<GameDocument>;
}> {
  const db = await getDb();
  return {
    words: db.collection<WordDocument>("words"),
    games: db.collection<GameDocument>("users-history"),
  };
}
