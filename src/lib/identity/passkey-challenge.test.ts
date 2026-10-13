import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "@/lib/cache";
import { toBase64Url } from "./crypto";
import {
  consumePasskeyChallenge,
  createPasskeyChallenge,
  PASSKEY_CHALLENGE_TTL_SECONDS,
  readPasskeyChallenge,
} from "./passkey-challenge";

const SECRET = "passkey-challenge-test-secret";
const encode = (token: string) => toBase64Url(new TextEncoder().encode(token));

/** What the browser echoes back in clientDataJSON for a challenge we issued. */
async function issue(ceremony: "register" | "sign-in", userId?: string, now = 1_000_000) {
  return encode(await createPasskeyChallenge(ceremony, userId, { secret: SECRET, now: () => now }));
}

const read = (echoed: string, expected: Parameters<typeof readPasskeyChallenge>[1], now = 1_000_000) =>
  readPasskeyChallenge(echoed, expected, { secret: SECRET, now: () => now });

describe("passkey challenges", () => {
  it("accept their own ceremony and player", async () => {
    expect(await read(await issue("register", "player-1"), { ceremony: "register", userId: "player-1" })).toEqual(
      expect.any(String),
    );
    expect(await read(await issue("sign-in"), { ceremony: "sign-in" })).toEqual(expect.any(String));
  });

  it("are unique", async () => {
    const [a, b] = await Promise.all([issue("sign-in"), issue("sign-in")]);
    expect(a).not.toBe(b);
  });

  it("can't be used for the other ceremony", async () => {
    expect(await read(await issue("sign-in"), { ceremony: "register" })).toBeNull();
    expect(await read(await issue("register", "player-1"), { ceremony: "sign-in" })).toBeNull();
  });

  it("are bound to the player who requested a registration", async () => {
    const echoed = await issue("register", "player-1");
    expect(await read(echoed, { ceremony: "register", userId: "player-2" })).toBeNull();
    expect(await read(echoed, { ceremony: "register" })).toBeNull();
  });

  it("expire", async () => {
    const echoed = await issue("sign-in", undefined, 0);
    expect(await read(echoed, { ceremony: "sign-in" }, PASSKEY_CHALLENGE_TTL_SECONDS * 1000 - 1)).not.toBeNull();
    expect(await read(echoed, { ceremony: "sign-in" }, PASSKEY_CHALLENGE_TTL_SECONDS * 1000)).toBeNull();
  });

  it("reject tampering, foreign signatures and garbage", async () => {
    const token = new TextDecoder().decode(Buffer.from(await issue("register", "player-1"), "base64url") as Uint8Array);
    const [, signature] = token.split(".");
    const forgedPayload = toBase64Url(
      new TextEncoder().encode(JSON.stringify({ c: "register", u: "player-2", n: "x", e: 9e15 })),
    );
    expect(
      await read(encode(`${forgedPayload}.${signature}`), { ceremony: "register", userId: "player-2" }),
    ).toBeNull();

    const foreign = encode(await createPasskeyChallenge("sign-in", undefined, { secret: "another-secret" }));
    expect(await read(foreign, { ceremony: "sign-in" })).toBeNull();

    for (const garbage of ["", "!!", encode("no-dot"), encode("a.b.c"), encode(".")]) {
      expect(await read(garbage, { ceremony: "sign-in" })).toBeNull();
    }
  });

  it("are single use once consumed", async () => {
    const cache = new Cache(new MemoryStore(), { onError: () => {} });
    expect(await consumePasskeyChallenge("nonce-1", { cache })).toBe(true);
    expect(await consumePasskeyChallenge("nonce-1", { cache })).toBe(false);
    expect(await consumePasskeyChallenge("nonce-2", { cache })).toBe(true);
  });

  it("fail open when the cache is down, like the proof of work", async () => {
    const store = new MemoryStore();
    store.setIfAbsent = () => Promise.reject(new Error("redis down"));
    const cache = new Cache(store, { onError: () => {}, retries: 0 });
    expect(await consumePasskeyChallenge("nonce", { cache })).toBe(true);
  });
});
