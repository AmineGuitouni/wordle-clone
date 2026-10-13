import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "@/lib/cache";
import { consumeRateLimit, peekRateLimit, type RateLimitPolicy } from "./rate-limit";

const policy: RateLimitPolicy = { name: "test", limit: 3, windowSeconds: 60 };

function setup() {
  let now = 0;
  const store = new MemoryStore(() => now);
  const cache = new Cache(store, { now: () => now, onError: () => {}, retries: 0 });
  return { store, cache, advance: (ms: number) => (now += ms) };
}

describe("consumeRateLimit", () => {
  it("allows events up to the limit and then blocks", async () => {
    const { cache } = setup();
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await consumeRateLimit(policy, "user", { cache }));

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0, 0]);
  });

  it("reports how long a blocked caller must wait", async () => {
    const { cache, advance } = setup();
    for (let i = 0; i < 3; i++) await consumeRateLimit(policy, "user", { cache });
    advance(20_000);
    const blocked = await consumeRateLimit(policy, "user", { cache });
    expect(blocked).toMatchObject({ allowed: false, retryAfterSeconds: 40 });
  });

  it("resets when the window ends", async () => {
    const { cache, advance } = setup();
    for (let i = 0; i < 4; i++) await consumeRateLimit(policy, "user", { cache });
    advance(60_001);
    expect((await consumeRateLimit(policy, "user", { cache })).allowed).toBe(true);
  });

  it("tracks subjects and policies independently", async () => {
    const { cache } = setup();
    for (let i = 0; i < 4; i++) await consumeRateLimit(policy, "alice", { cache });
    expect((await consumeRateLimit(policy, "bob", { cache })).allowed).toBe(true);
    expect((await consumeRateLimit({ ...policy, name: "other" }, "alice", { cache })).allowed).toBe(true);
  });

  it("never lets concurrent callers exceed the limit", async () => {
    const { cache } = setup();
    const results = await Promise.all(Array.from({ length: 20 }, () => consumeRateLimit(policy, "user", { cache })));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });

  describe("when the cache backend is down", () => {
    function broken() {
      const store = new MemoryStore();
      store.incr = () => Promise.reject(new Error("redis down"));
      return new Cache(store, { onError: () => {}, retries: 0 });
    }

    it("fails open by default so the game stays playable", async () => {
      const result = await consumeRateLimit(policy, "user", { cache: broken() });
      expect(result).toMatchObject({ allowed: true, remaining: 3 });
    });

    it("can fail closed", async () => {
      await expect(consumeRateLimit(policy, "user", { cache: broken(), failOpen: false })).rejects.toThrow(
        "Cache incr failed",
      );
    });
  });
});

describe("peekRateLimit", () => {
  it("reads usage and the remaining window without consuming", async () => {
    const { cache, advance } = setup();
    expect(await peekRateLimit(policy, "user", { cache })).toEqual({ used: 0, resetsInSeconds: 0 });
    await consumeRateLimit(policy, "user", { cache });
    await consumeRateLimit(policy, "user", { cache });
    advance(15_000);
    expect(await peekRateLimit(policy, "user", { cache })).toEqual({ used: 2, resetsInSeconds: 45 });
    expect(await peekRateLimit(policy, "user", { cache })).toEqual({ used: 2, resetsInSeconds: 45 });
  });
});
