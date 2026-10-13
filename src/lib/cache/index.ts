import "server-only";
import { Cache } from "./cache";
import { MemoryStore } from "./memory-store";
import { RedisStore } from "./redis-store";

export { Cache } from "./cache";
export { MemoryStore } from "./memory-store";
export { RedisStore } from "./redis-store";
export { CacheUnavailableError, type CacheStore, type CounterState } from "./types";

/** Key prefix. Override with CACHE_NAMESPACE to let several environments (staging, prod, tests) share one Redis. */
const namespace = () => process.env.CACHE_NAMESPACE || "gtw";

const globalForCache = globalThis as typeof globalThis & { appCache?: Cache };

function createCache(): Cache {
  const url = process.env.REDIS_URL;

  if (!url) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[cache] REDIS_URL is not set: using a per-process in-memory cache. Rate limits and caches will not be " +
          "shared between instances.",
      );
    }
    return new Cache(new MemoryStore(), { namespace: namespace() });
  }

  let lastLog = 0;
  const store = new RedisStore({
    url,
    onError: (error) => {
      const now = Date.now();
      if (now - lastLog > 10_000) {
        lastLog = now;
        console.error("[cache] Redis connection error:", error.message);
      }
    },
  });
  return new Cache(store, { namespace: namespace() });
}

/** The app-wide cache: Redis when `REDIS_URL` is set, otherwise in-memory. Created lazily and reused across hot reloads. */
export function getCache(): Cache {
  globalForCache.appCache ??= createCache();
  return globalForCache.appCache;
}
