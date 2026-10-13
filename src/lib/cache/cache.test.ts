import { describe, expect, it, vi } from "vitest";
import { Cache } from "./cache";
import { MemoryStore } from "./memory-store";
import { CacheUnavailableError, type CacheStore } from "./types";

const noSleep = () => Promise.resolve();

/** A store whose every call fails until `failing` is switched off. */
class FlakyStore extends MemoryStore {
  failing = false;
  calls = 0;
  private guard<T>(fn: () => Promise<T>): Promise<T> {
    this.calls++;
    return this.failing ? Promise.reject(new Error("redis down")) : fn();
  }
  override get = (key: string) => this.guard(() => super.get(key));
  override set = (key: string, value: string, ttl?: number) => this.guard(() => super.set(key, value, ttl));
  override del = (...keys: string[]) => this.guard(() => super.del(...keys));
  override incr = (key: string, ttl: number) => this.guard(() => super.incr(key, ttl));
  override setIfAbsent = (key: string, value: string, ttl: number) =>
    this.guard(() => super.setIfAbsent(key, value, ttl));
  override counter = (key: string) => this.guard(() => super.counter(key));
  override ping = () => this.guard(() => super.ping());
}

function setup(options: ConstructorParameters<typeof Cache>[1] = {}) {
  const store = new FlakyStore();
  const onError = vi.fn();
  let now = 1_000_000;
  const cache = new Cache(store, { sleep: noSleep, onError, now: () => now, ...options });
  return { store, cache, onError, advance: (ms: number) => (now += ms) };
}

describe("Cache basics", () => {
  it("round-trips JSON values", async () => {
    const { cache } = setup();
    await cache.set("k", { a: 1, list: ["x", "y"], nested: { ok: true } });
    expect(await cache.get("k")).toEqual({ a: 1, list: ["x", "y"], nested: { ok: true } });
    expect(await cache.get("missing")).toBeNull();
  });

  it("namespaces keys in the underlying store", async () => {
    const store = new MemoryStore();
    const cache = new Cache(store, { namespace: "app" });
    await cache.set("k", 1);
    expect(await store.get("app:k")).toBe("1");
    expect(await store.get("k")).toBeNull();
  });

  it("deletes keys", async () => {
    const { cache } = setup();
    await cache.set("a", 1);
    await cache.set("b", 2);
    expect(await cache.del("a", "b")).toBe(true);
    expect(await cache.get("a")).toBeNull();
  });

  it("treats a corrupt value as a miss and evicts it", async () => {
    const store = new MemoryStore();
    const cache = new Cache(store);
    await store.set("k", "{not json");
    expect(await cache.get("k")).toBeNull();
    expect(await store.get("k")).toBeNull();
  });

  it("refuses to cache undefined", async () => {
    const { cache } = setup();
    expect(await cache.set("k", undefined)).toBe(false);
  });

  it("reads counters written by incr", async () => {
    const { cache } = setup();
    await cache.incr("c", 60);
    await cache.incr("c", 60);
    expect(await cache.getCounter("c")).toMatchObject({ count: 2 });
    expect(await cache.getCounter("none")).toBeNull();
  });

  it("setIfAbsent is a one-time-use check", async () => {
    const { cache } = setup();
    expect(await cache.setIfAbsent("once", 1, 60)).toBe(true);
    expect(await cache.setIfAbsent("once", 1, 60)).toBe(false);
  });
});

describe("getOrSet", () => {
  it("loads once, then serves from cache", async () => {
    const { cache } = setup();
    const loader = vi.fn().mockResolvedValue({ n: 1 });
    expect(await cache.getOrSet("k", 60, loader)).toEqual({ n: 1 });
    expect(await cache.getOrSet("k", 60, loader)).toEqual({ n: 1 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("shares one loader run between concurrent callers", async () => {
    const { cache } = setup();
    const loader = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "value";
    });
    const results = await Promise.all(Array.from({ length: 10 }, () => cache.getOrSet("k", 60, loader)));
    expect(results).toEqual(Array(10).fill("value"));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("does not cache null results", async () => {
    const { cache } = setup();
    const loader = vi.fn().mockResolvedValue(null);
    await cache.getOrSet("k", 60, loader);
    await cache.getOrSet("k", 60, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("propagates loader errors and does not poison later calls", async () => {
    const { cache } = setup();
    const loader = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue("ok");
    await expect(cache.getOrSet("k", 60, loader)).rejects.toThrow("db down");
    await expect(cache.getOrSet("k", 60, loader)).resolves.toBe("ok");
  });
});

describe("failure handling", () => {
  it("soft operations degrade instead of throwing when the backend is down", async () => {
    const { cache, store } = setup();
    store.failing = true;
    expect(await cache.get("k")).toBeNull();
    expect(await cache.set("k", 1)).toBe(false);
    expect(await cache.del("k")).toBe(false);
    expect(await cache.getCounter("c")).toBeNull();
    expect(await cache.isHealthy()).toBe(false);
  });

  it("getOrSet still runs the loader when the cache is down", async () => {
    const { cache, store } = setup();
    store.failing = true;
    expect(await cache.getOrSet("k", 60, async () => "from db")).toBe("from db");
  });

  it("strict operations throw CacheUnavailableError carrying the cause", async () => {
    const { cache, store } = setup();
    store.failing = true;
    const failure = await cache.incr("c", 60).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CacheUnavailableError);
    expect((failure as CacheUnavailableError).cause).toEqual(new Error("redis down"));
    await expect(cache.setIfAbsent("k", 1, 60)).rejects.toBeInstanceOf(CacheUnavailableError);
  });

  it("retries idempotent reads on transient errors but never retries incr", async () => {
    const store = new FlakyStore();
    const cache = new Cache(store, { retries: 2, sleep: noSleep, onError: () => {}, failureThreshold: 100 });
    store.failing = true;

    await cache.get("k");
    expect(store.calls).toBe(3); // 1 attempt + 2 retries

    store.calls = 0;
    await cache.incr("c", 60).catch(() => {});
    expect(store.calls).toBe(1);
  });

  it("recovers a read that fails once", async () => {
    const store = new FlakyStore();
    const cache = new Cache(store, { retries: 1, sleep: noSleep });
    await cache.set("k", "v");
    const realGet = MemoryStore.prototype.get.bind(store);
    let first = true;
    store.get = async (key) => {
      if (first) {
        first = false;
        throw new Error("blip");
      }
      return realGet(key);
    };
    expect(await cache.get("k")).toBe("v");
  });

  it("opens the circuit after repeated failures and fails fast", async () => {
    const { cache, store } = setup({ failureThreshold: 3, cooldownMs: 10_000, retries: 0 });
    store.failing = true;

    for (let i = 0; i < 3; i++) await cache.get("k");
    expect(store.calls).toBe(3);

    // Circuit is open: no further traffic reaches the backend.
    await cache.get("k");
    await expect(cache.incr("c", 60)).rejects.toThrow("circuit open");
    expect(store.calls).toBe(3);
  });

  it("closes the circuit again once the backend recovers after the cooldown", async () => {
    const { cache, store, advance } = setup({ failureThreshold: 2, cooldownMs: 5_000, retries: 0 });
    store.failing = true;
    await cache.get("k");
    await cache.get("k");
    store.failing = false;

    await expect(cache.incr("c", 60)).rejects.toThrow("circuit open");
    advance(5_001);
    await expect(cache.incr("c", 60)).resolves.toMatchObject({ count: 1 });
    await expect(cache.incr("c", 60)).resolves.toMatchObject({ count: 2 });
  });

  it("re-opens the circuit if the probe after the cooldown fails", async () => {
    const { cache, store, advance } = setup({ failureThreshold: 2, cooldownMs: 5_000, retries: 0 });
    store.failing = true;
    await cache.get("k");
    await cache.get("k");
    advance(5_001);

    await cache.get("k"); // probe fails
    const callsAfterProbe = store.calls;
    await cache.get("k"); // short-circuited again
    expect(store.calls).toBe(callsAfterProbe);
  });

  it("throttles error logging during an outage", async () => {
    const { cache, store, onError, advance } = setup({ failureThreshold: 1_000, retries: 0 });
    store.failing = true;
    for (let i = 0; i < 20; i++) await cache.get("k");
    expect(onError).toHaveBeenCalledTimes(1);
    advance(10_001);
    await cache.get("k");
    expect(onError).toHaveBeenCalledTimes(2);
  });
});

describe("typing", () => {
  it("accepts any CacheStore implementation", () => {
    const store: CacheStore = new MemoryStore();
    expect(new Cache(store)).toBeInstanceOf(Cache);
  });
});
