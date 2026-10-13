import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCache } from "./index";

const globalForCache = globalThis as typeof globalThis & { appCache?: unknown };

describe("getCache without REDIS_URL", () => {
  beforeEach(() => {
    delete globalForCache.appCache;
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("CACHE_NAMESPACE", "index-test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    delete globalForCache.appCache;
  });

  it("falls back to a working in-memory cache", async () => {
    const cache = getCache();

    expect(await cache.set("k", { a: 1 }, 60)).toBe(true);
    expect(await cache.get("k")).toEqual({ a: 1 });

    const loader = vi.fn(async () => "loaded");
    expect(await cache.getOrSet("lazy", 60, loader)).toBe("loaded");
    expect(await cache.getOrSet("lazy", 60, loader)).toBe("loaded");
    expect(loader).toHaveBeenCalledTimes(1);

    expect((await cache.incr("count", 60)).count).toBe(1);
    expect((await cache.incr("count", 60)).count).toBe(2);
    expect(await cache.setIfAbsent("once", 1, 60)).toBe(true);
    expect(await cache.setIfAbsent("once", 1, 60)).toBe(false);
  });

  it("reuses one instance", () => {
    expect(getCache()).toBe(getCache());
  });

  it("warns once in production that the cache is per process", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    getCache();
    getCache();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("REDIS_URL is not set");
  });

  it("stays quiet outside production", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getCache();
    expect(warn).not.toHaveBeenCalled();
  });
});
