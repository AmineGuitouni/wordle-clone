import { randomUUID } from "node:crypto";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GameDocument, IdentityDocument, WordDocument } from "@/lib/db";
import { authorizeGuest } from "@/lib/identity/authorize";
import { DEVICE_COOKIE, createDeviceId, encodeDeviceCookie } from "@/lib/identity/device";
import { solveProof } from "@/lib/identity/pow";
import { RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Exercises the real /api/identity handler (proof of work, cookies, rate limits) and the Auth.js authorize hook
 * against a real MongoDB. Skipped unless TEST_MONGODB_URI is set. See service.integration.test.ts for setup.
 */
const uri = process.env.TEST_MONGODB_URI;
const dbName = `guess-the-word-identity-test-${Date.now()}`;
const SECRET = "identity-integration-secret";
const BASE_BITS = 4;

describe.skipIf(!uri)("identity endpoint (MongoDB)", () => {
  let route: typeof import("./route");
  let service: typeof import("@/lib/game/service");
  let cache: import("@/lib/cache").Cache;
  let client: MongoClient;
  let db: Db;
  let ipCounter = 0;
  const saved: Record<string, string | undefined> = {};

  const nextIp = () => `198.51.100.${++ipCounter}`;

  async function post(body: unknown, { ip = nextIp(), cookie }: { ip?: string; cookie?: string } = {}) {
    const response = await route.POST(
      new Request("http://localhost:3000/api/identity", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, body: await response.json(), headers: response.headers };
  }

  /** Runs the full handshake from a cookie-less browser and returns the issued cookie. */
  async function createIdentity(name: string, ip = nextIp()) {
    const first = await post({ name }, { ip });
    expect(first.body.status).toBe("challenge_required");
    const { token, salt, difficulty } = first.body.challenge;
    const second = await post({ name, challenge: { token, nonce: await solveProof(salt, difficulty) } }, { ip });
    expect(second.body).toEqual({ status: "ok" });
    const cookie = second.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${DEVICE_COOKIE}=`))!
      .split(";")[0];
    return { cookie, ip };
  }

  beforeAll(async () => {
    for (const key of [
      "MONGODB_URI",
      "MONGODB_DB",
      "AUTH_SECRET",
      "POW_DIFFICULTY_BITS",
      "REDIS_URL",
      "CACHE_NAMESPACE",
    ])
      saved[key] = process.env[key];
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB = dbName;
    process.env.AUTH_SECRET = SECRET;
    process.env.POW_DIFFICULTY_BITS = String(BASE_BITS);
    process.env.CACHE_NAMESPACE = `test-${randomUUID()}`; // isolates this run's counters, even on a shared Redis
    if (process.env.TEST_REDIS_URL) process.env.REDIS_URL = process.env.TEST_REDIS_URL;

    route = await import("./route");
    service = await import("@/lib/game/service");
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

  describe("new devices", () => {
    it("must solve a proof of work before receiving an identity cookie", async () => {
      const { cookie } = await createIdentity("Alice");
      expect(cookie).toMatch(new RegExp(`^${DEVICE_COOKIE}=[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]+$`));
    });

    it("records when the identity was created, which decides when its wins start to rank", async () => {
      const before = Date.now();
      const { cookie } = await createIdentity("Alice");
      const id = cookie.split("=")[1].split(".")[0];

      const record = await db.collection<IdentityDocument>("identities").findOne({ _id: id });
      expect(record).toMatchObject({ name: "Alice" });
      expect(record!.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(record!.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("issues the cookie as httpOnly, SameSite=Lax, long-lived and not cached", async () => {
      const ip = nextIp();
      const first = await post({ name: "Alice" }, { ip });
      const { token, salt, difficulty } = first.body.challenge;
      const done = await post(
        { name: "Alice", challenge: { token, nonce: await solveProof(salt, difficulty) } },
        { ip },
      );
      const setCookie = done.headers.getSetCookie().join("\n");

      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=lax/i);
      expect(setCookie).toMatch(/Max-Age=31536000/);
      expect(setCookie).not.toMatch(/Secure/i); // plain http in this test
      expect(done.headers.get("cache-control")).toBe("no-store");
    });

    it("marks the cookie Secure behind an https proxy", async () => {
      const ip = nextIp();
      const request = (body: unknown) =>
        new Request("http://localhost:3000/api/identity", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": ip, "x-forwarded-proto": "https" },
          body: JSON.stringify(body),
        });
      const first = await (await route.POST(request({ name: "Alice" }))).json();
      const { token, salt, difficulty } = first.challenge;
      const done = await route.POST(
        request({ name: "Alice", challenge: { token, nonce: await solveProof(salt, difficulty) } }),
      );
      expect(done.headers.getSetCookie().join("\n")).toMatch(/Secure/i);
    });

    it("rejects a wrong solution, a replayed solution, and a forged token", async () => {
      const ip = nextIp();
      const { body } = await post({ name: "Alice" }, { ip });
      const { token, salt, difficulty } = body.challenge;
      const nonce = await solveProof(salt, difficulty);

      // Forged: lowered difficulty without a valid signature.
      const [payload] = token.split(".");
      const forged = await post({ name: "Alice", challenge: { token: `${payload}.AAAA`, nonce } }, { ip });
      expect(forged).toMatchObject({ status: 400, body: { error: "invalid_challenge" } });
      expect(forged.body).not.toHaveProperty("reason"); // failure details stay server-side

      // Correct once...
      expect((await post({ name: "Alice", challenge: { token, nonce } }, { ip })).body).toEqual({ status: "ok" });
      // ...but a challenge is single use, even for another visitor.
      const replay = await post({ name: "Mallory", challenge: { token, nonce } }, { ip: nextIp() });
      expect(replay).toMatchObject({ status: 400, body: { error: "invalid_challenge" } });
    });

    it("ignores a forged or foreign-signed device cookie and demands the challenge", async () => {
      const forged = `${DEVICE_COOKIE}=${createDeviceId()}.forged`;
      expect((await post({ name: "Eve" }, { cookie: forged })).body.status).toBe("challenge_required");

      const foreign = `${DEVICE_COOKIE}=${await encodeDeviceCookie(createDeviceId(), "someone-elses-secret")}`;
      expect((await post({ name: "Eve" }, { cookie: foreign })).body.status).toBe("challenge_required");
    });

    it("rejects invalid names before doing any work", async () => {
      for (const name of ["", "x", "<script>", 42, null]) {
        expect(await post({ name })).toMatchObject({ status: 400, body: { error: "invalid_name" } });
      }
      expect((await post("not an object")).status).toBe(400);
    });
  });

  describe("returning devices", () => {
    it("recognise their cookie: no challenge, same identity, new name", async () => {
      const { cookie, ip } = await createIdentity("Alice");

      const renamed = await post({ name: "Alice Reborn" }, { ip, cookie });
      expect(renamed.body).toEqual({ status: "ok" });
      // The refreshed cookie carries the very same device id.
      const refreshed = renamed.headers.getSetCookie()[0].split(";")[0];
      expect(refreshed.split("=")[1].split(".")[0]).toBe(cookie.split("=")[1].split(".")[0]);
    });

    it("update their recorded name, and give identities from before records existed an old creation date", async () => {
      const { cookie, ip } = await createIdentity("Alice");
      await post({ name: "Alicia" }, { ip, cookie });
      const id = cookie.split("=")[1].split(".")[0];
      expect(await db.collection<IdentityDocument>("identities").findOne({ _id: id })).toMatchObject({
        name: "Alicia",
      });

      // A cookie signed before identities were recorded: it must not suddenly look brand new.
      const legacyId = createDeviceId();
      const legacy = `${DEVICE_COOKIE}=${await encodeDeviceCookie(legacyId, SECRET)}`;
      expect((await post({ name: "Veteran" }, { cookie: legacy })).body).toEqual({ status: "ok" });
      expect(await db.collection<IdentityDocument>("identities").findOne({ _id: legacyId })).toMatchObject({
        name: "Veteran",
        createdAt: new Date(0),
      });
    });

    it("keep their game when they change their name, so the guess limit can't be reset", async () => {
      const { cookie, ip } = await createIdentity("Alice");

      // Sign in (Auth.js authorize) and play one guess.
      const first = await authorizeGuest({ name: "Alice" }, new Request("http://localhost/x", { headers: { cookie } }));
      await service.submitGuess({ userId: first!.id, name: first!.name, guess: "CRANE" });

      // Sign out, come back as someone else, same browser.
      await post({ name: "Totally Someone Else" }, { ip, cookie });
      const second = await authorizeGuest(
        { name: "Totally Someone Else" },
        new Request("http://localhost/x", { headers: { cookie } }),
      );

      expect(second!.id).toBe(first!.id);
      const view = await service.getGameView(second!.id, await service.getTodaysRound());
      expect(view.guesses).toEqual(["CRANE"]); // progress survived the rename
      const game = await db.collection<GameDocument>("users-history").findOne({ userId: first!.id });
      expect(game?.name).toBe("Totally Someone Else");
    });

    it("different browsers get different identities", async () => {
      const a = await createIdentity("Same Name");
      const b = await createIdentity("Same Name");
      expect(a.cookie.split(".")[0]).not.toBe(b.cookie.split(".")[0]);
    });
  });

  describe("abuse limits", () => {
    it("makes each new identity from one IP harder, then stops handing them out", async () => {
      const ip = nextIp();
      const difficulties: number[] = [];

      for (let i = 0; i < RATE_LIMITS.identityCreations.limit; i++) {
        const first = await post({ name: "Bot" }, { ip });
        const { token, salt, difficulty } = first.body.challenge;
        difficulties.push(difficulty);
        const done = await post(
          { name: "Bot", challenge: { token, nonce: await solveProof(salt, difficulty) } },
          { ip },
        );
        expect(done.body).toEqual({ status: "ok" });
      }

      // Each identity from this IP doubled the work, up to the escalation cap.
      expect(difficulties.slice(0, 7)).toEqual([4, 5, 6, 7, 8, 9, 10]);
      expect(Math.max(...difficulties)).toBe(BASE_BITS + 6);

      // The next one is refused outright, with a Retry-After.
      const blocked = await post({ name: "Bot" }, { ip });
      expect(blocked.status).toBe(429);
      expect(blocked.body.retryAfterSeconds).toBeGreaterThan(0);
      expect(Number(blocked.headers.get("retry-after"))).toBe(blocked.body.retryAfterSeconds);

      // Other networks are unaffected.
      expect((await post({ name: "Human" })).body.status).toBe("challenge_required");
    });

    it("does not count returning devices against the creation limit", async () => {
      const { cookie, ip } = await createIdentity("Regular");
      for (let i = 0; i < 12; i++)
        expect((await post({ name: `Regular ${i}` }, { ip, cookie })).body).toEqual({ status: "ok" });
    });

    it("limits how often one IP can hit the endpoint at all", async () => {
      const ip = nextIp();
      const statuses: number[] = [];
      for (let i = 0; i < RATE_LIMITS.identityRequests.limit + 3; i++)
        statuses.push((await post({ name: "" }, { ip })).status);

      expect(statuses.slice(0, RATE_LIMITS.identityRequests.limit).every((s) => s === 400)).toBe(true);
      expect(statuses.slice(RATE_LIMITS.identityRequests.limit)).toEqual([429, 429, 429]);
    });

    it("skips per-IP accounting when no client IP is available, but still requires the proof of work", async () => {
      const request = (body: unknown) =>
        new Request("http://localhost:3000/api/identity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      for (let i = 0; i < 40; i++)
        expect((await (await route.POST(request({ name: "Local" }))).json()).status).toBe("challenge_required");
    });
  });
});
