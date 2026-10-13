import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "@/lib/cache";
import { createChallenge, verifyChallenge } from "./challenge";
import { CHALLENGE_TTL_SECONDS, baseDifficultyBits, difficultyFor } from "./policy";
import { solveProof } from "./pow";
import { toBase64Url } from "./crypto";

const SECRET = "test-secret";
const DIFFICULTY = 8;

function setup() {
  let now = 1_700_000_000_000;
  const cache = new Cache(new MemoryStore(() => now), { now: () => now, onError: () => {} });
  const options = { cache, secret: SECRET, now: () => now };
  return { cache, options, advance: (ms: number) => (now += ms) };
}

describe("challenges", () => {
  it("accepts a correct, fresh solution exactly once", async () => {
    const { options } = setup();
    const challenge = await createChallenge(DIFFICULTY, options);
    const nonce = await solveProof(challenge.salt, challenge.difficulty);

    expect(await verifyChallenge(challenge.token, nonce, options)).toEqual({ ok: true });
    expect(await verifyChallenge(challenge.token, nonce, options)).toEqual({ ok: false, reason: "replayed" });
  });

  it("rejects a wrong nonce without burning the challenge", async () => {
    const { options } = setup();
    const challenge = await createChallenge(DIFFICULTY, options);
    const nonce = await solveProof(challenge.salt, challenge.difficulty);

    // Find a nonce that does NOT solve it.
    let wrong = nonce + 1;
    while ((await verifyChallenge(challenge.token, wrong, { ...options, cache: setup().cache })).ok) wrong++;

    expect(await verifyChallenge(challenge.token, wrong, options)).toEqual({ ok: false, reason: "bad_proof" });
    expect(await verifyChallenge(challenge.token, nonce, options)).toEqual({ ok: true });
  });

  it("rejects an expired challenge", async () => {
    const { options, advance } = setup();
    const challenge = await createChallenge(DIFFICULTY, options);
    const nonce = await solveProof(challenge.salt, challenge.difficulty);
    advance((CHALLENGE_TTL_SECONDS + 1) * 1000);
    expect(await verifyChallenge(challenge.token, nonce, options)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects tampering: lowered difficulty, extended expiry, or another secret", async () => {
    const { options } = setup();
    const challenge = await createChallenge(20, options);
    const [, signature] = challenge.token.split(".");

    const forgedPayload = toBase64Url(
      new TextEncoder().encode(JSON.stringify({ s: challenge.salt, d: 0, e: challenge.expiresAt })),
    );
    expect(await verifyChallenge(`${forgedPayload}.${signature}`, 0, options)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    expect(await verifyChallenge(challenge.token, 0, { ...options, secret: "other-secret" })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it.each([
    ["not-a-token", 1],
    ["a.b.c", 1],
    [42, 1],
    [null, 1],
  ])("rejects a malformed token %p", async (token, nonce) => {
    const { options } = setup();
    expect(await verifyChallenge(token, nonce, options)).toEqual({
      ok: false,
      reason: expect.stringMatching(/malformed|bad_signature/),
    });
  });

  it.each([[-1], [1.5], ["12"], [Number.MAX_SAFE_INTEGER + 1], [null]])(
    "rejects a malformed nonce %p",
    async (nonce) => {
      const { options } = setup();
      const challenge = await createChallenge(DIFFICULTY, options);
      expect(await verifyChallenge(challenge.token, nonce, options)).toEqual({ ok: false, reason: "malformed" });
    },
  );

  it("fails open when the replay store is down, since challenges still expire", async () => {
    const store = new MemoryStore();
    store.setIfAbsent = () => Promise.reject(new Error("redis down"));
    const cache = new Cache(store, { onError: () => {}, retries: 0 });
    const challenge = await createChallenge(DIFFICULTY, { secret: SECRET });
    const nonce = await solveProof(challenge.salt, challenge.difficulty);
    expect(await verifyChallenge(challenge.token, nonce, { cache, secret: SECRET })).toEqual({ ok: true });
  });
});

describe("difficulty policy", () => {
  it("escalates with recent identity creations and then caps", () => {
    const levels = [0, 1, 2, 3, 4, 5, 6, 7, 50].map((n) => difficultyFor(n, 16));
    expect(levels).toEqual([16, 17, 18, 19, 20, 21, 22, 22, 22]);
  });

  it("reads the base difficulty from the environment with a safe default", () => {
    const original = process.env.POW_DIFFICULTY_BITS;
    try {
      process.env.POW_DIFFICULTY_BITS = "5";
      expect(baseDifficultyBits()).toBe(5);
      process.env.POW_DIFFICULTY_BITS = "garbage";
      expect(baseDifficultyBits()).toBe(16);
      process.env.POW_DIFFICULTY_BITS = "99";
      expect(baseDifficultyBits()).toBe(16);
    } finally {
      if (original === undefined) delete process.env.POW_DIFFICULTY_BITS;
      else process.env.POW_DIFFICULTY_BITS = original;
    }
  });
});
