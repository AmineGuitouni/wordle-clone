import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  linkGamesToRounds,
  prepareDatabase,
  type GameDocument,
  type IdentityDocument,
  type WordDocument,
} from "@/lib/db";
import type { Cache } from "@/lib/cache";
import { MAX_ATTEMPTS } from "./rules";
import { isValidWord, WORDS } from "./words";

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
  const identities = () => db.collection<IdentityDocument>("identities");
  const play = (userId: string, guess: string, ip?: string) =>
    service.submitGuess({ userId, name: `Player ${userId}`, guess, ip });
  const round = () => service.getTodaysRound();
  const view = async (userId: string) => service.getGameView(userId, await round());
  const board = async (userId?: string, limit?: number) => service.getLeaderboard(await round(), userId, limit);

  /** Starts a new round behind the service's back, then drops the cached round as `rotateTodaysWord` does. */
  async function newRound(word: string) {
    await new Promise((resolve) => setTimeout(resolve, 2)); // keep rounds strictly ordered in time
    await words().insertOne({ word, createdAt: new Date() });
    await cache.del(service.CACHE_KEYS.todaysRound);
  }

  /** Plays `guesses`, then backdates the start so the game took `timeMs`. */
  async function finishGame(userId: string, guesses: string[], timeMs: number) {
    for (const guess of guesses) await play(userId, guess);
    const finishedAt = new Date();
    await games().updateOne({ userId }, { $set: { createdAt: new Date(finishedAt.getTime() - timeMs), finishedAt } });
  }

  beforeAll(async () => {
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB = dbName;
    process.env.CACHE_NAMESPACE = `test-${randomUUID()}`; // isolates this run's cache keys, even on a shared Redis
    process.env.AUTH_SECRET = "service-integration-secret"; // keys the network hashes
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
    await Promise.all([words().deleteMany({}), games().deleteMany({}), identities().deleteMany({})]);
    await words().insertOne({ word: ANSWER, createdAt: new Date(Date.now() - 60_000) });
    // Leaderboard keys are per round, and every test starts a new round, so only the round itself is cached across tests.
    await cache.del(service.CACHE_KEYS.todaysRound);
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

    it("rotates to a word that hasn't been used yet while there are any", async () => {
      const unused = ["mount", "crane"];
      const past = Date.now() - 1_000_000;
      await words().insertMany(
        WORDS.filter((word) => !unused.includes(word)).map((word, i) => ({ word, createdAt: new Date(past + i) })),
      );
      await service.rotateTodaysWord();
      const first = await service.getTodaysWord();
      expect(unused).toContain(first);
      await service.rotateTodaysWord();
      expect(await service.getTodaysWord()).toBe(unused.find((word) => word !== first));
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
        provisional: false,
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
      await newRound("mount");
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
    it("ranks winners by score, ignores losses and unfinished games, and flags the current user", async () => {
      await finishGame("fast", ["WORLD"], 5_000);
      await finishGame("steady", ["CRANE", "MOUNT", "WORLD"], 5_000);
      await finishGame("slow", ["WORLD"], 120_000);
      for (const guess of WRONG_GUESSES) await play("loser", guess);
      await play("idle", "CRANE");

      const ranking = await board("steady");

      expect(ranking.map((entry) => entry.name)).toEqual(["Player fast", "Player steady", "Player slow"]);
      expect(ranking.find((entry) => entry.name === "Player steady")).toMatchObject({ isCurrentUser: true, tries: 3 });
      expect(ranking.filter((entry) => entry.isCurrentUser)).toHaveLength(1);
      expect(ranking[0].name).toBe("Player fast");
    });

    it("serves the ranking from the cache until a game is won", async () => {
      await finishGame("a", ["WORLD"], 1_000);
      expect(await board()).toHaveLength(1);

      // Written behind the service's back: not visible while the cached ranking is fresh.
      await games().insertOne({
        userId: "ghost",
        name: "Ghost",
        roundId: (await round()).id,
        toDaysWord: ANSWER,
        words: ["WORLD"],
        createdAt: new Date(Date.now() - 5_000),
        finishedAt: new Date(),
        won: true,
      } as GameDocument);
      expect(await board()).toHaveLength(1);

      // A win through the service invalidates the cache, so the next read sees everyone.
      await finishGame("b", ["WORLD"], 2_000);
      expect((await board()).map((entry) => entry.name).sort()).toEqual(["Ghost", "Player a", "Player b"]);
    });

    it("never exposes the internal user id", async () => {
      await service.submitGuess({ userId: "secret-device-id", name: "Visible Name", guess: "WORLD" });
      const [entry] = await board("secret-device-id");
      expect(Object.keys(entry).sort()).toEqual([
        "isCurrentUser",
        "name",
        "provisional",
        "rank",
        "score",
        "timeMs",
        "tries",
      ]);
      expect(JSON.stringify(entry)).not.toContain("secret-device-id");
      expect(entry).toMatchObject({ name: "Visible Name", isCurrentUser: true });
    });

    it("shows a renamed player under the new name right away, keeping the same game", async () => {
      await finishGame("alice", ["WORLD"], 1_000);
      expect((await board())[0].name).toBe("Player alice");

      await service.renamePlayer("alice", "Alice Reborn");

      expect((await board("alice"))[0]).toMatchObject({
        name: "Alice Reborn",
        isCurrentUser: true,
      });
      expect(await games().countDocuments({ userId: "alice" })).toBe(1);
      // Renaming does not reset progress: the game is still over.
      expect(await play("alice", "CRANE")).toEqual({ ok: false, error: "game_over" });
    });

    it("only counts games from today's round and honours the limit", async () => {
      await finishGame("a", ["WORLD"], 1_000);
      await finishGame("b", ["WORLD"], 2_000);
      expect(await board(undefined, 1)).toHaveLength(1);
      await newRound("mount");
      expect(await board()).toEqual([]);
    });
  });

  describe("when a word comes back on a later day", () => {
    it("gives everyone a fresh game and a fresh leaderboard", async () => {
      await finishGame("alice", ["WORLD"], 3_000);
      for (const guess of WRONG_GUESSES) await play("bob", guess);
      const firstTime = await round();

      await newRound("mount");
      await newRound(ANSWER);

      // Alice's win from last time doesn't carry over, and Bob isn't locked out by last time's loss.
      expect(await view("alice")).toMatchObject({ guesses: [], status: "playing" });
      expect(await play("bob", "WORLD")).toMatchObject({ ok: true, status: "won" });

      expect((await board()).map((entry) => entry.name)).toEqual(["Player bob"]);
      expect((await service.getLeaderboard(firstTime)).map((entry) => entry.name)).toEqual(["Player alice"]);
      expect(await games().countDocuments({ userId: "bob" })).toBe(2);
    });

    it("counts the earlier game with the same word as history for the ranking rules", async () => {
      const coffeeShop = "203.0.113.30";
      await identities().insertOne({
        _id: "regular",
        name: "Player regular",
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        lastSeenAt: new Date(),
      });
      await play("regular", "WORLD", coffeeShop); // their only game so far

      await newRound(ANSWER);
      for (const guess of WRONG_GUESSES) await play("someone-else", guess, coffeeShop);
      expect(await play("regular", "WORLD", coffeeShop)).toMatchObject({ status: "won", provisional: false });
    });
  });

  describe("upgrading data saved before rounds were tracked", () => {
    const HOUR = 60 * 60 * 1000;
    let legacy: Db;

    beforeEach(async () => {
      legacy = client.db(`${dbName}-legacy`);
      await legacy.dropDatabase();
    });

    it("links each old game to the round it was played in and retires the index that keyed games by word", async () => {
      const now = Date.now();
      const legacyGames = legacy.collection("users-history");
      await legacyGames.createIndex({ userId: 1, toDaysWord: 1 }, { unique: true });
      const { insertedIds: rounds } = await legacy.collection("words").insertMany([
        { word: "world", createdAt: new Date(now - 72 * HOUR) },
        { word: "mount", createdAt: new Date(now - 48 * HOUR) },
        { word: "world", createdAt: new Date(now - 24 * HOUR) },
      ]);
      const game = (userId: string, toDaysWord: string, createdAt: number) => ({
        userId,
        toDaysWord,
        words: [],
        createdAt: new Date(createdAt),
        finishedAt: null,
      });
      await legacyGames.insertMany([
        game("alice", "world", now - 71 * HOUR), // first time "world" was live
        game("bob", "world", now - 23 * HOUR), // second time
        game("carol", "mount", now - 47 * HOUR),
        game("dave", "zzzzz", now - 10 * HOUR), // its word no longer exists
      ]);

      await prepareDatabase(legacy);

      const linked = Object.fromEntries(
        (await legacyGames.find().toArray()).map((doc) => [doc.userId, doc.roundId?.toHexString() ?? null]),
      );
      expect(linked).toEqual({
        alice: rounds[0].toHexString(),
        bob: rounds[2].toHexString(),
        carol: rounds[1].toHexString(),
        dave: null,
      });

      const indexes = (await legacyGames.indexes()).map((index) => index.name);
      expect(indexes).not.toContain("userId_1_toDaysWord_1");
      expect(indexes).toContain("userId_1_roundId_1");

      // Alice can now have a game the second time "world" is live...
      await legacyGames.insertOne({ ...game("alice", "world", now), roundId: rounds[2] });
      // ...but still only one per round.
      await expect(legacyGames.insertOne({ ...game("alice", "world", now), roundId: rounds[2] })).rejects.toThrow(
        /duplicate key/,
      );

      // Running it again changes nothing.
      expect(await linkGamesToRounds(legacy)).toBe(0);
    });

    it("sets up an empty database without complaining", async () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      await prepareDatabase(legacy);
      expect(errors).not.toHaveBeenCalled();
      errors.mockRestore();
    });

    afterAll(async () => {
      await legacy?.dropDatabase();
    });
  });
  describe("who counts on the leaderboard", () => {
    const DAY = 24 * 60 * 60 * 1000;
    const COFFEE_SHOP = "203.0.113.20";

    async function identity(id: string, createdAt: Date) {
      await identities().insertOne({ _id: id, name: `Player ${id}`, createdAt, lastSeenAt: createdAt });
    }

    /** A finished game on an earlier word, i.e. some history. */
    async function history(userId: string) {
      const finishedAt = new Date(Date.now() - 2 * DAY);
      await games().insertOne({
        userId,
        name: `Player ${userId}`,
        roundId: new ObjectId(),
        toDaysWord: "mount",
        words: ["MOUNT"],
        createdAt: finishedAt,
        finishedAt,
        won: true,
      } as GameDocument);
    }

    async function lose(userId: string, ip?: string) {
      for (const guess of WRONG_GUESSES) await play(userId, guess, ip);
    }

    it("makes a win provisional for an identity created after the word went live", async () => {
      await finishGame("veteran", ["CRANE", "WORLD"], 30_000); // predates identity records: ranked
      await identity("newcomer", new Date());

      const win = await play("newcomer", "WORLD");
      expect(win).toMatchObject({ ok: true, status: "won", provisional: true });
      expect(await games().findOne({ userId: "newcomer" })).toMatchObject({ won: true, ranked: false });
      expect((await view("newcomer")).provisional).toBe(true);

      // Other players never see it...
      expect((await board()).map((entry) => entry.name)).toEqual(["Player veteran"]);
      expect((await board("veteran")).map((entry) => entry.name)).toEqual(["Player veteran"]);
      // ...its player sees it, marked, at the place it would take, without pushing anyone down.
      expect(await board("newcomer")).toMatchObject([
        { name: "Player newcomer", rank: 1, provisional: true, isCurrentUser: true },
        { name: "Player veteran", rank: 1, provisional: false, isCurrentUser: false },
      ]);
    });

    it("blocks the lose, clear cookies, win-instantly retry", async () => {
      await identity("cheater", new Date(Date.now() - 5 * DAY));
      await history("cheater");
      await lose("cheater", COFFEE_SHOP);
      expect((await view("cheater")).answer).toBe("WORLD");

      await identity("cheater-again", new Date()); // fresh cookie
      expect(await play("cheater-again", "WORLD", COFFEE_SHOP)).toMatchObject({ status: "won", provisional: true });
      expect(await board()).toEqual([]);
    });

    it("ranks an identity created before the word went live", async () => {
      await identity("early", new Date(Date.now() - 2 * DAY));
      expect(await play("early", "WORLD")).toMatchObject({ status: "won", provisional: false });
      expect(await board("early")).toMatchObject([
        { name: "Player early", rank: 1, provisional: false, isCurrentUser: true },
      ]);
    });

    it("makes an unused spare identity provisional on a network where someone already finished", async () => {
      await identity("first", new Date(Date.now() - 5 * DAY));
      await history("first");
      await lose("first", COFFEE_SHOP);

      await identity("spare", new Date(Date.now() - 3 * DAY)); // made in advance, never played
      expect(await play("spare", "WORLD", COFFEE_SHOP)).toMatchObject({ status: "won", provisional: true });
    });

    it("ranks regulars who share a network, like two players in one coffee shop", async () => {
      for (const id of ["regular-1", "regular-2"]) {
        await identity(id, new Date(Date.now() - 5 * DAY));
        await history(id);
      }
      expect(await play("regular-1", "WORLD", COFFEE_SHOP)).toMatchObject({ provisional: false });
      expect(await play("regular-2", "WORLD", COFFEE_SHOP)).toMatchObject({ provisional: false });
      expect((await board()).map((entry) => entry.name).sort()).toEqual(["Player regular-1", "Player regular-2"]);
    });

    it("ranks an unused older identity on a network where nobody else finished", async () => {
      await identity("first", new Date(Date.now() - 5 * DAY));
      await lose("first", COFFEE_SHOP);
      await identity("elsewhere", new Date(Date.now() - 3 * DAY));
      expect(await play("elsewhere", "WORLD", "198.51.100.77")).toMatchObject({ provisional: false });
    });

    it("treats rotating IPv6 privacy addresses in one /64 as the same network", async () => {
      await identity("first", new Date(Date.now() - 5 * DAY));
      await lose("first", "2001:db8:1:2::aaaa");
      await identity("spare", new Date(Date.now() - 3 * DAY));
      expect(await play("spare", "WORLD", "2001:db8:1:2:9999::1")).toMatchObject({ provisional: true });
    });

    it("stores only a keyed hash of the network, different for every word", async () => {
      await identity("someone", new Date(Date.now() - 2 * DAY));
      await play("someone", "WORLD", COFFEE_SHOP);
      const stored = await games().findOne({ userId: "someone" });
      expect(stored?.networkKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(JSON.stringify(stored)).not.toContain("203.0.113");

      const today = await round();
      const tomorrow = { id: new ObjectId() };
      expect(await service.networkKey(COFFEE_SHOP, today)).toBe(stored?.networkKey);
      expect(await service.networkKey(COFFEE_SHOP, tomorrow)).not.toBe(stored?.networkKey);
    });
  });
});
