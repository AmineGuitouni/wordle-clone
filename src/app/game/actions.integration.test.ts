import { randomUUID } from "node:crypto";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { WordDocument } from "@/lib/db";
import { RATE_LIMITS } from "@/lib/rate-limit";

// The real Auth.js session needs a request context; everything else in the action runs for real.
let currentUser: { id: string; name: string } | null = null;
vi.mock("@/auth", () => ({ auth: async () => (currentUser ? { user: currentUser } : null) }));
// The action reads the client IP from the request headers, which only exist inside a real request.
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.50" }) }));

/** The submitGuess server action end to end (session, rate limit, validation, persistence). Needs TEST_MONGODB_URI. */
const uri = process.env.TEST_MONGODB_URI;
const dbName = `guess-the-word-actions-test-${Date.now()}`;

describe.skipIf(!uri)("submitGuess server action", () => {
  let action: typeof import("./actions");
  let cache: import("@/lib/cache").Cache;
  let client: MongoClient;
  let db: Db;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const key of ["MONGODB_URI", "MONGODB_DB", "REDIS_URL", "CACHE_NAMESPACE", "AUTH_SECRET"])
      saved[key] = process.env[key];
    process.env.MONGODB_URI = uri;
    process.env.AUTH_SECRET = "actions-integration-secret"; // keys the network hash of finished games
    process.env.MONGODB_DB = dbName;
    process.env.CACHE_NAMESPACE = `test-${randomUUID()}`;
    if (process.env.TEST_REDIS_URL) process.env.REDIS_URL = process.env.TEST_REDIS_URL;

    action = await import("./actions");
    cache = (await import("@/lib/cache")).getCache();
    client = await new MongoClient(uri!).connect();
    db = client.db(dbName);
    await db.collection<WordDocument>("words").insertOne({ word: "world", createdAt: new Date() });
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
    await cache.close();
    const shared = (globalThis as { mongoClientPromise?: Promise<MongoClient> }).mongoClientPromise;
    await (await shared)?.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("rejects unauthenticated callers", async () => {
    currentUser = null;
    expect(await action.submitGuess("CRANE")).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("scores a valid guess for a signed-in player", async () => {
    currentUser = { id: "player-1", name: "Player One" };
    expect(await action.submitGuess("crane")).toMatchObject({ ok: true, status: "playing" });
  });

  it("rejects words that are not in the dictionary", async () => {
    currentUser = { id: "player-2", name: "Player Two" };
    expect(await action.submitGuess("zzzzz")).toEqual({ ok: false, error: "invalid_word" });
    expect(await action.submitGuess("<script>")).toEqual({ ok: false, error: "invalid_word" });
  });

  it("throttles a player who spams the endpoint, but only that player", async () => {
    currentUser = { id: "spammer", name: "Spammer" };
    const { limit } = RATE_LIMITS.guesses;

    const results = [];
    for (let i = 0; i < limit + 5; i++) results.push(await action.submitGuess("CRANE"));

    const throttled = results.filter((r) => !r.ok && r.error === "rate_limited");
    expect(throttled).toHaveLength(5);
    // Everything up to the limit was handled normally: 6 real guesses, then "game over" for the rest.
    expect(results.slice(0, limit).every((r) => r.ok || r.error === "game_over")).toBe(true);
    expect(results.slice(limit).every((r) => !r.ok && r.error === "rate_limited")).toBe(true);

    // Another player is unaffected.
    currentUser = { id: "innocent", name: "Innocent" };
    expect(await action.submitGuess("CRANE")).toMatchObject({ ok: true });
  });

  it("does not let invalid input dodge the limit", async () => {
    currentUser = { id: "prober", name: "Prober" };
    const results = [];
    for (let i = 0; i < RATE_LIMITS.guesses.limit + 3; i++) results.push(await action.submitGuess("zzzzz"));
    expect(results.slice(-3)).toEqual(Array(3).fill({ ok: false, error: "rate_limited" }));
  });
});
