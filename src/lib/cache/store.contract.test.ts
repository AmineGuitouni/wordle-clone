import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "./memory-store";
import { RedisStore } from "./redis-store";
import type { CacheStore } from "./types";

/**
 * Both backends must behave identically, so one suite runs against each.
 * The Redis run needs a server: TEST_REDIS_URL=redis://127.0.0.1:6380 npm test
 */
const redisUrl = process.env.TEST_REDIS_URL;
const prefix = `contract-${Date.now()}-`;

function contract(name: string, create: () => CacheStore, options: { realTime: boolean }) {
  describe(`${name} store contract`, () => {
    const store = create();
    let n = 0;
    let key: string;

    beforeEach(() => {
      key = `${prefix}${n++}`;
    });
    afterAll(() => store.close());

    it("returns null for a missing key and the value once set", async () => {
      expect(await store.get(key)).toBeNull();
      await store.set(key, "hello");
      expect(await store.get(key)).toBe("hello");
    });

    it("overwrites existing values", async () => {
      await store.set(key, "a");
      await store.set(key, "b");
      expect(await store.get(key)).toBe("b");
    });

    it("deletes keys and reports how many existed", async () => {
      const other = `${key}-other`;
      await store.set(key, "1");
      await store.set(other, "2");
      expect(await store.del(key, other, `${key}-missing`)).toBe(2);
      expect(await store.get(key)).toBeNull();
      expect(await store.del()).toBe(0);
    });

    it("setIfAbsent only stores the first value", async () => {
      expect(await store.setIfAbsent(key, "first", 60)).toBe(true);
      expect(await store.setIfAbsent(key, "second", 60)).toBe(false);
      expect(await store.get(key)).toBe("first");
    });

    it("incr counts upwards and reports the remaining window", async () => {
      const first = await store.incr(key, 60);
      const second = await store.incr(key, 60);
      expect(first.count).toBe(1);
      expect(second.count).toBe(2);
      expect(second.ttlSeconds).toBeGreaterThan(0);
      expect(second.ttlSeconds).toBeLessThanOrEqual(60);
      expect(await store.get(key)).toBe("2");
    });

    it("incr is atomic under concurrency", async () => {
      const results = await Promise.all(Array.from({ length: 25 }, () => store.incr(key, 60)));
      expect(results.map((r) => r.count).sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    });

    it("reads a counter without changing it", async () => {
      expect(await store.counter(key)).toBeNull();
      await store.incr(key, 60);
      await store.incr(key, 60);
      const before = await store.counter(key);
      const after = await store.counter(key);
      expect(before).toMatchObject({ count: 2 });
      expect(before?.ttlSeconds).toBeGreaterThan(0);
      expect(after?.count).toBe(2);
      await store.set(`${key}-text`, "not a number");
      expect(await store.counter(`${key}-text`)).toBeNull();
    });

    it("pings", async () => {
      expect(await store.ping()).toBe(true);
    });

    // TTL behaviour needs real waiting on Redis; the memory store is covered with a fake clock below.
    it.runIf(options.realTime)("expires keys and restarts counter windows", async () => {
      await store.set(key, "temp", 1);
      await store.incr(`${key}-counter`, 1);
      await new Promise((resolve) => setTimeout(resolve, 1_150));
      expect(await store.get(key)).toBeNull();
      expect((await store.incr(`${key}-counter`, 1)).count).toBe(1);
    });
  });
}

contract("Memory", () => new MemoryStore(), { realTime: true });
describe.skipIf(!redisUrl)("Redis", () => {
  contract("Redis", () => new RedisStore({ url: redisUrl! }), { realTime: true });
});

describe("MemoryStore with a fake clock", () => {
  it("expires entries and restarts counter windows as time passes", async () => {
    let now = 1_000_000;
    const store = new MemoryStore(() => now);

    await store.set("k", "v", 10);
    await store.incr("c", 10);
    await store.incr("c", 10);
    now += 9_000;
    expect(await store.get("k")).toBe("v");
    expect((await store.incr("c", 10)).count).toBe(3);

    now += 1_001;
    expect(await store.get("k")).toBeNull();
    expect((await store.incr("c", 10)).count).toBe(1);
  });

  it("keeps the window anchored to the first increment", async () => {
    let now = 0;
    const store = new MemoryStore(() => now);
    await store.incr("c", 60);
    now += 30_000;
    const { ttlSeconds } = await store.incr("c", 60);
    expect(ttlSeconds).toBe(30);
  });

  it("evicts the oldest entries when full", async () => {
    const store = new MemoryStore(Date.now, 3);
    for (const key of ["a", "b", "c", "d"]) await store.set(key, key);
    expect(await store.get("a")).toBeNull();
    expect(await store.get("d")).toBe("d");
  });
});
