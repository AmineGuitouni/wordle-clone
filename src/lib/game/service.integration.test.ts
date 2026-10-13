import { randomUUID } from "node:crypto";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { GameDocument, WordDocument } from "@/lib/db";
import type { Cache } from "@/lib/cache";
import { MAX_ATTEMPTS } from "./rules";
import { isValidWord } from "./words";

/**
 * Runs the real service against a real MongoDB. Skipped unless TEST_MONGODB_URI is set, e.g.:
 *   docker run -d -p 27018:27017 mongo:7
 *   TEST_MONGODB_URI=mongodb://127.0.0.1:27018 npm test
 * Set TEST_REDIS_URL as well (use a spare database index, e.g. redis://127.0.0.1:6380/1) to run against Redis
 * instead of the in-memory cache.
 */
const uri = process.env.TEST_MONGODB_URI;
const dbName = `guess-the-word-test-${Date.now()}`;

const ANSWER = "world";
// Valid dictionary words that are not the answer.
const WRONG_GUESSES = ["CRANE", "MOUNT", "POUND", "OCEAN", "ROUND", "WORDS"];

describe.skipIf(!uri)("game service (MongoDB)", () => {
  let service: typeof import("./service");
  let cache: Cache;
  let client: MongoClient;
  let db: Db;

  const words = () => db.collection<WordDocument>("words");
  const games = () => db.collection<GameDocument>("users-history");
  const play = (userId: string, guess: string) => service.submitGuess({ userId, name: `Player ${userId}`, guess });

  beforeAll(async () => {
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB = dbName;
    process.env.CACHE_NAMESPACE = `test-${randomUUID()}`; // isolates this run's cache keys, even on a shared Redis
    if (process.env.TEST_REDIS_URL) process.env.REDIS_URL = process.env.TEST_REDIS_URL;
    service = await import("./service");
    cache = (await import("@/lib/cache")).getCache();
    client = await new MongoClient(uri!).connect();
    db = client.db(dbName);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
    await cache.close();
    const shared = (globalThis as { mongoClientPromise?: Promise<MongoClient> }).mongoClientPromise;
    await (await shared)?.close();
  });

  beforeEach(async () => {
    await Promise.all([words().deleteMany({}), games().deleteMany({})]);
    await words().insertOne({ word: ANSWER, createdAt: new Date(Date.now() - 60_000) });
    const { CACHE_KEYS } = service;
    await cache.del(CACHE_KEYS.todaysWord, CACHE_KEYS.leaderboard(ANSWER), CACHE_KEYS.leaderboard("mount"));
  });

  describe("today's word", () => {
    it("seeds a word on a fresh deployment and then keeps returning the same one", async () => {
      await words().deleteMany({});
      const first = await service.getTodaysWord();
      expect(isValidWord(first)).toBe(true);
      expect(await service.getTodaysWord()).toBe(first);
      expect(await words().countDocuments()).toBe(1);
    });

    it("serves today's word from the cache and refreshes it when the word rotates", async () => {
      expect(await service.getTodaysWord()).toBe(ANSWER);

      // A newer word written behind the service's back is invisible until the cache is invalidated.
      await words().insertOne({ word: "mount", createdAt: new Date() });
      expect(await service.getTodaysWord()).toBe(ANSWER);

      await new Promise((resolve) => setTimeout(resolve, 5));
      await service.rotateTodaysWord();
      const rotated = await service.getTodaysWord();
      expect(rotated).not.toBe(ANSWER);
      expect(rotated).not.toBe("mount");
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
      await words().insertOne({ word: "mount", createdAt: new Date() });
      await cache.del(service.CACHE_KEYS.todaysWord); // what rotateTodaysWord does
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

      expect(board.map((entry) => entry.name)).toEqual(["Player fast", "Player steady", "Player slow"]);
      expect(board.find((entry) => entry.name === "Player steady")).toMatchObject({ isCurrentUser: true, tries: 3 });
      expect(board.filter((entry) => entry.isCurrentUser)).toHaveLength(1);
      expect(board[0].name).toBe("Player fast");
    });

    it("serves the ranking from the cache until a game is won", async () => {
      await finishGame("a", ["WORLD"], 1_000);
      expect(await service.getLeaderboard(ANSWER)).toHaveLength(1);

      // Written behind the service's back: not visible while the cached ranking is fresh.
      await games().insertOne({
        userId: "ghost",
        name: "Ghost",
        toDaysWord: ANSWER,
        words: ["WORLD"],
        createdAt: new Date(Date.now() - 5_000),
        finishedAt: new Date(),
        won: true,
      } as GameDocument);
      expect(await service.getLeaderboard(ANSWER)).toHaveLength(1);

      // A win through the service invalidates the cache, so the next read sees everyone.
      await finishGame("b", ["WORLD"], 2_000);
      expect((await service.getLeaderboard(ANSWER)).map((entry) => entry.name).sort()).toEqual([
        "Ghost",
        "Player a",
        "Player b",
      ]);
    });

    it("never exposes the internal user id", async () => {
      await service.submitGuess({ userId: "secret-device-id", name: "Visible Name", guess: "WORLD" });
      const [entry] = await service.getLeaderboard(ANSWER, "secret-device-id");
      expect(Object.keys(entry).sort()).toEqual(["isCurrentUser", "name", "score", "timeMs", "tries"]);
      expect(JSON.stringify(entry)).not.toContain("secret-device-id");
      expect(entry).toMatchObject({ name: "Visible Name", isCurrentUser: true });
    });

    it("shows a renamed player under the new name right away, keeping the same game", async () => {
      await finishGame("alice", ["WORLD"], 1_000);
      expect((await service.getLeaderboard(ANSWER))[0].name).toBe("Player alice");

      await service.renamePlayer("alice", "Alice Reborn");

      expect((await service.getLeaderboard(ANSWER, "alice"))[0]).toMatchObject({
        name: "Alice Reborn",
        isCurrentUser: true,
      });
      expect(await games().countDocuments({ userId: "alice" })).toBe(1);
      // Renaming does not reset progress: the game is still over.
      expect(await play("alice", "CRANE")).toEqual({ ok: false, error: "game_over" });
    });

    it("only counts games for today's word and honours the limit", async () => {
      await finishGame("a", ["WORLD"], 1_000);
      await finishGame("b", ["WORLD"], 2_000);
      expect(await service.getLeaderboard(ANSWER, undefined, 1)).toHaveLength(1);
      expect(await service.getLeaderboard("mount")).toEqual([]);
    });
  });
});
