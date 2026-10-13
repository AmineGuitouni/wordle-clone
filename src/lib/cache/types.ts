/**
 * Minimal key/value contract every cache backend implements.
 * Values are plain strings; serialisation, namespacing and resilience live in the `Cache` service.
 */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  /** Stores a value, optionally expiring after `ttlSeconds`. */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  /** Stores a value only if the key does not exist yet. Resolves to whether it was stored. */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  /** Deletes keys and resolves to how many existed. */
  del(...keys: string[]): Promise<number>;
  /**
   * Atomically increments a counter. The first increment starts a window of `ttlSeconds`;
   * later ones keep that window, so the count resets when it ends.
   */
  incr(key: string, ttlSeconds: number): Promise<CounterState>;
  /** Reads a counter written by `incr` without changing it. Resolves to null when there is none. */
  counter(key: string): Promise<CounterState | null>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export type CounterState = {
  count: number;
  /** Whole seconds until the window ends. */
  ttlSeconds: number;
};

/** The cache backend is failing or deliberately short-circuited; callers decide whether to degrade or fail. */
export class CacheUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CacheUnavailableError";
  }

  /**
   * Use instead of `instanceof`. The bundler can load this module more than once (RSC and server-action layers,
   * hot reloads) while the cache instance is shared through `globalThis`, so each copy has its own class identity.
   */
  static is(error: unknown): error is CacheUnavailableError {
    return error instanceof Error && error.name === "CacheUnavailableError";
  }
}
