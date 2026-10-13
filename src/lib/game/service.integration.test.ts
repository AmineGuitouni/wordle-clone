import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { GameDocument, WordDocument } from "@/lib/db";
import { MAX_ATTEMPTS } from "./rules";
import { isValidWord } from "./words";

/**
 * Runs the real service against a real MongoDB. Skipped unless TEST_MONGODB_URI is set, e.g.:
 *   docker run -d -p 27018:27017 mongo:7
 *   TEST_MONGODB_URI=mongodb://127.0.0.1:27018 npm test
 */
const uri = process.env.TEST_MONGODB_URI;
const dbName = `guess-the-word-test-${Date.now()}`;

const ANSWER = "world";
// Valid dictionary words that are not the answer.
const WRONG_GUESSES = ["CRANE", "MOUNT", "POUND", "OCEAN", "ROUND", "WORDS"];

describe.skipIf(!uri)("game service (MongoDB)", () => {
  let service: typeof import("./service");
  let client: MongoClient;
  let db: Db;

  const words = () => db.collection<WordDocument>("words");
  const games = () => db.collection<GameDocument>("users-history");
  const play = (userId: string, guess: string) => service.submitGuess({ userId, name: `Player ${userId}`, guess });

  beforeAll(async () => {
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB = dbName;
    service = await import("./service");
    client = await new MongoClient(uri!).connect();
    db = client.db(dbName);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
    const shared = (globalThis as { mongoClientPromise?: Promise<MongoClient> }).mongoClientPromise;
    await (await shared)?.close();
  });

  beforeEach(async () => {
    await Promise.all([words().deleteMany({}), games().deleteMany({})]);
    await words().insertOne({ word: ANSWER, createdAt: new Date() });
  });

  describe("today's word", () => {
    it("seeds a word on a fresh deployment and then keeps returning the same one", async () => {
      await words().deleteMany({});
      const first = await service.getTodaysWord();
      expect(isValidWord(first)).toBe(true);
      expect(await service.getTodaysWord()).toBe(first);
      expect(await words().countDocuments()).toBe(1);
    });

    it("rotates to a different word", async () => {
      for (let i = 0; i < 20; i++) {
        const before = await service.getTodaysWord();
        await service.rotateTodaysWord();
        expect(await service.getTodaysWord()).not.toBe(before);
      }
    });
  });

  describe("submitGuess", () => {
    it("scores a miss without revealing the answer", async () => {
      const response = await play("alice", "CRANE");
      expect(response).toEqual({
        ok: true,
        result: ["absent", "present", "absent", "absent", "absent"],
        status: "playing",
        answer: null,
      });
    });

    it("lets the player win and then refuses further guesses", async () => {
      const win = await play("alice", "WORLD");
      expect(win).toMatchObject({ ok: true, status: "won", answer: null });

      expect(await play("alice", "CRANE")).toEqual({ ok: false, error: "game_over" });
      const stored = await games().findOne({ userId: "alice" });
      expect(stored).toMatchObject({ words: ["WORLD"], won: true });
      expect(stored?.finishedAt).toBeInstanceOf(Date);
    });

    it("ends the game after six misses, reveals the answer, and refuses a seventh guess", async () => {
      for (const guess of WRONG_GUESSES.slice(0, MAX_ATTEMPTS - 1)) {
        expect(await play("bob", guess)).toMatchObject({ ok: true, status: "playing" });
      }
      expect(await play("bob", WRONG_GUESSES[MAX_ATTEMPTS - 1])).toMatchObject({
        ok: true,
        status: "lost",
        answer: "WORLD",
      });

      expect(await play("bob", "WORLD")).toEqual({ ok: false, error: "game_over" });
      expect(await games().findOne({ userId: "bob" })).toMatchObject({ won: false });
    });

    it("keeps each player's game separate", async () => {
      await play("alice", "CRANE");
      await play("bob", "MOUNT");
      expect((await games().findOne({ userId: "alice" }))?.words).toEqual(["CRANE"]);
      expect((await games().findOne({ userId: "bob" }))?.words).toEqual(["MOUNT"]);
    });

    it("starts a fresh game when the word changes", async () => {
      await play("alice", "CRANE");
      await words().insertOne({ word: "mount", createdAt: new Date(Date.now() + 1000) });
      expect(await play("alice", "WORLD")).toMatchObject({ ok: true, status: "playing" });
      expect(await games().countDocuments({ userId: "alice" })).toBe(2);
    });

    it("never records more guesses than were accepted when requests race", async () => {
      const guesses = [...WRONG_GUESSES, "WORLD", "CRANE", "MOUNT", "POUND"];
      const responses = await Promise.all(guesses.map((guess) => play("racer", guess)));

      const accepted = responses.filter((response) => response.ok).length;
      const stored = await games().find({ userId: "racer" }).toArray();

      // Racing first guesses must converge on a single game document...
      expect(stored).toHaveLength(1);
      // ...whose history holds exactly the accepted guesses, never more than the limit.
      expect(accepted).toBeGreaterThanOrEqual(1);
      expect(stored[0].words).toHaveLength(accepted);
      expect(stored[0].words.length).toBeLessThanOrEqual(MAX_ATTEMPTS);
      for (const response of responses) {
        if (!response.ok) expect(["out_of_sync", "game_over"]).toContain(response.error);
      }
    });
  });

  describe("getLeaderboard", () => {
    async function finishGame(userId: string, guesses: string[], timeMs: number) {
      for (const guess of guesses) await play(userId, guess);
      const finishedAt = new Date();
      await games().updateOne({ userId }, { $set: { createdAt: new Date(finishedAt.getTime() - timeMs), finishedAt } });
    }

    it("ranks winners by score, ignores losses and unfinished games, and flags the current user", async () => {
      await finishGame("fast", ["WORLD"], 5_000);
      await finishGame("steady", ["CRANE", "MOUNT", "WORLD"], 5_000);
      await finishGame("slow", ["WORLD"], 120_000);
      for (const guess of WRONG_GUESSES) await play("loser", guess);
      await play("idle", "CRANE");

      const board = await service.getLeaderboard(ANSWER, "steady");

      expect(board.map((entry) => entry.id)).toEqual(["fast", "steady", "slow"]);
      expect(board.find((entry) => entry.id === "steady")).toMatchObject({ isCurrentUser: true, tries: 3 });
      expect(board.filter((entry) => entry.isCurrentUser)).toHaveLength(1);
      expect(board[0].name).toBe("Player fast");
    });

    it("only counts games for today's word and honours the limit", async () => {
      await finishGame("a", ["WORLD"], 1_000);
      await finishGame("b", ["WORLD"], 2_000);
      expect(await service.getLeaderboard(ANSWER, undefined, 1)).toHaveLength(1);
      expect(await service.getLeaderboard("mount")).toEqual([]);
    });
  });
});
