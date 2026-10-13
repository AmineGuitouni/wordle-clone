import { randomUUID } from "node:crypto";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { IdentityDocument, PasskeyDocument } from "@/lib/db";
import { authorizeGuest } from "@/lib/identity/authorize";
import { createDeviceId, DEVICE_COOKIE, readDeviceId } from "@/lib/identity/device";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { SoftAuthenticator } from "@/test/soft-authenticator";

// Route handlers read the Auth.js session; everything else (WebAuthn verification, storage, cookies) runs for real.
let currentUser: { id: string; name: string } | null = null;
vi.mock("@/auth", () => ({ auth: async () => (currentUser ? { user: currentUser } : null) }));

/** The passkey endpoints end to end, with a software authenticator. Needs TEST_MONGODB_URI (see README). */
const uri = process.env.TEST_MONGODB_URI;
const dbName = `guess-the-word-passkeys-test-${Date.now()}`;
const ORIGIN = "http://localhost:3000";

describe.skipIf(!uri)("passkey endpoints (MongoDB)", () => {
  let registerOptions: typeof import("./register/options/route");
  let registerVerify: typeof import("./register/verify/route");
  let signInOptions: typeof import("./sign-in/options/route");
  let signInVerify: typeof import("./sign-in/verify/route");
  let passkeys: typeof import("@/lib/identity/passkeys");
  let cache: import("@/lib/cache").Cache;
  let client: MongoClient;
  let db: Db;
  let ipCounter = 0;
  const saved: Record<string, string | undefined> = {};

  async function call(
    route: { POST: (req: Request) => Promise<Response> },
    path: string,
    body?: unknown,
    { ip = `198.51.100.${++ipCounter}` }: { ip?: string } = {},
  ) {
    const response = await route.POST(
      new Request(`${ORIGIN}/api/passkeys/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    return { status: response.status, body: await response.json(), headers: response.headers };
  }

  /** Signs `player` in (mocked session), then saves a passkey for them with a fresh authenticator. */
  async function savePasskeyFor(player: { id: string; name: string }, authenticator = new SoftAuthenticator(ORIGIN)) {
    currentUser = player;
    const options = await call(registerOptions, "register/options");
    expect(options.status).toBe(200);
    const verify = await call(registerVerify, "register/verify", { response: authenticator.register(options.body) });
    expect(verify.body).toEqual({ status: "ok" });
    currentUser = null;
    return authenticator;
  }

  async function signInWith(authenticator: SoftAuthenticator, assertion?: { origin?: string; rpId?: string }) {
    const options = await call(signInOptions, "sign-in/options");
    expect(options.status).toBe(200);
    return call(signInVerify, "sign-in/verify", { response: authenticator.authenticate(options.body, assertion) });
  }

  const identities = () => db.collection<IdentityDocument>("identities");
  const storedPasskeys = () => db.collection<PasskeyDocument>("passkeys");

  beforeAll(async () => {
    for (const key of ["MONGODB_URI", "MONGODB_DB", "AUTH_SECRET", "REDIS_URL", "CACHE_NAMESPACE"])
      saved[key] = process.env[key];
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB = dbName;
    process.env.AUTH_SECRET = "passkey-integration-secret";
    process.env.CACHE_NAMESPACE = `test-${randomUUID()}`;
    if (process.env.TEST_REDIS_URL) process.env.REDIS_URL = process.env.TEST_REDIS_URL;

    registerOptions = await import("./register/options/route");
    registerVerify = await import("./register/verify/route");
    signInOptions = await import("./sign-in/options/route");
    signInVerify = await import("./sign-in/verify/route");
    passkeys = await import("@/lib/identity/passkeys");
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
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  beforeEach(() => {
    currentUser = null;
  });

  it("carries an identity to another browser: same id, same name, same creation date", async () => {
    const player = { id: createDeviceId(), name: "Amira" };
    const createdAt = new Date("2026-01-02T03:04:05Z");
    await identities().insertOne({ _id: player.id, name: player.name, createdAt, lastSeenAt: createdAt });

    const authenticator = await savePasskeyFor(player);
    expect(await passkeys.hasPasskey(player.id)).toBe(true);
    const stored = await storedPasskeys().findOne({ _id: authenticator.id });
    expect(stored).toMatchObject({ userId: player.id, counter: 0, transports: ["internal"] });

    // A different browser with no cookie and no session.
    const signedIn = await signInWith(authenticator);
    expect(signedIn).toMatchObject({ status: 200, body: { status: "ok", name: "Amira" } });
    const cookie = signedIn.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${DEVICE_COOKIE}=`))!
      .split(";")[0];
    expect(await readDeviceId(cookie)).toBe(player.id);

    // The regular Auth.js sign-in then resolves to the very same player.
    const session = await authorizeGuest({ name: "Amira" }, new Request(`${ORIGIN}/x`, { headers: { cookie } }));
    expect(session?.id).toBe(player.id);

    // The identity record (and so its ranking eligibility) is unchanged.
    expect((await identities().findOne({ _id: player.id }))?.createdAt).toEqual(createdAt);
    expect((await storedPasskeys().findOne({ _id: authenticator.id }))?.counter).toBe(1);
  });

  it("records identities that predate identity records as established when they save a passkey", async () => {
    const player = { id: createDeviceId(), name: "Old Timer" };
    await savePasskeyFor(player);
    expect(await identities().findOne({ _id: player.id })).toMatchObject({
      name: "Old Timer",
      createdAt: new Date(0),
    });
  });

  it("requires a session to save a passkey", async () => {
    expect(await call(registerOptions, "register/options")).toMatchObject({ status: 401 });
    expect(await call(registerVerify, "register/verify", { response: {} })).toMatchObject({ status: 401 });
  });

  it("tells the browser which passkeys this player already saved", async () => {
    const player = { id: createDeviceId(), name: "Repeat" };
    const authenticator = await savePasskeyFor(player);
    currentUser = player;
    const options = await call(registerOptions, "register/options");
    expect(options.body.excludeCredentials).toEqual([
      { id: authenticator.id, type: "public-key", transports: ["internal"] },
    ]);
    expect(options.body.authenticatorSelection).toMatchObject({ residentKey: "required" });
  });

  it("binds a registration challenge to the player who asked for it", async () => {
    currentUser = { id: createDeviceId(), name: "Alice" };
    const options = await call(registerOptions, "register/options");
    const response = new SoftAuthenticator(ORIGIN).register(options.body);

    currentUser = { id: createDeviceId(), name: "Mallory" };
    expect(await call(registerVerify, "register/verify", { response })).toMatchObject({
      status: 400,
      body: { error: "invalid_passkey" },
    });
    expect(await storedPasskeys().countDocuments({ userId: currentUser.id })).toBe(0);
  });

  it("uses each sign-in challenge once", async () => {
    const authenticator = await savePasskeyFor({ id: createDeviceId(), name: "Once" });
    const options = await call(signInOptions, "sign-in/options");
    const response = authenticator.authenticate(options.body);

    expect((await call(signInVerify, "sign-in/verify", { response })).status).toBe(200);
    const replay = await call(signInVerify, "sign-in/verify", { response });
    expect(replay).toMatchObject({ status: 400, body: { error: "invalid_passkey" } });
    expect(replay.headers.getSetCookie()).toEqual([]);
  });

  it("rejects assertions made for another site", async () => {
    const authenticator = await savePasskeyFor({ id: createDeviceId(), name: "Phished" });
    expect(await signInWith(authenticator, { origin: "https://evil.example" })).toMatchObject({ status: 400 });
    expect(await signInWith(authenticator, { rpId: "evil.example" })).toMatchObject({ status: 400 });
  });

  it("rejects passkeys this site never saved, and malformed bodies", async () => {
    expect(await signInWith(new SoftAuthenticator(ORIGIN))).toMatchObject({
      status: 400,
      body: { error: "invalid_passkey" },
    });
    for (const response of [undefined, null, "x", { id: 42 }, { id: "" }]) {
      expect((await call(signInVerify, "sign-in/verify", { response })).status).toBe(400);
    }
  });

  it("rejects a passkey presented with someone else's user handle", async () => {
    const authenticator = await savePasskeyFor({ id: createDeviceId(), name: "Owner" });
    authenticator.userHandle = Buffer.from(createDeviceId()).toString("base64url");
    expect(await signInWith(authenticator)).toMatchObject({ status: 400 });
  });

  it("limits sign-in attempts per network", async () => {
    const ip = "203.0.113.99";
    const statuses: number[] = [];
    for (let i = 0; i < RATE_LIMITS.passkeySignIns.limit + 2; i++)
      statuses.push((await call(signInOptions, "sign-in/options", undefined, { ip })).status);
    expect(statuses.slice(0, RATE_LIMITS.passkeySignIns.limit).every((status) => status === 200)).toBe(true);
    expect(statuses.slice(RATE_LIMITS.passkeySignIns.limit)).toEqual([429, 429]);
  });
});
