import { MongoClient, ObjectId, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB;

if (!uri) {
  throw new Error("MONGODB_URI is not configured");
}

if (!databaseName) {
  throw new Error("MONGODB_DB is not configured");
}

const globalForMongo = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

const client = new MongoClient(uri, { appName: "wordle-clone" });

export const clientPromise =
  globalForMongo.mongoClientPromise ??
  (globalForMongo.mongoClientPromise = client.connect());

export async function getDb(): Promise<Db> {
  return (await clientPromise).db(databaseName);
}

export type WordDocument = {
  word: string;
  createdAt: Date;
};

export type HistoryDocument = {
  _id?: ObjectId;
  userId: string;
  toDaysWord: string;
  words: string[];
  colors: string[];
  letters: {
    letter: string;
    type: "right" | "wrong" | "missPlaced";
  }[];
  createdAt: Date;
  finishedAt: Date | null;
};

export type UserDocument = {
  _id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};
