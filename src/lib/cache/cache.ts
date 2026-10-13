import { retry } from "@/lib/retry";
import { CacheUnavailableError, type CacheStore, type CounterState } from "./types";

export type CacheOptions = {
  /** Prepended to every key (`namespace:key`) so several apps or environments can share one Redis. */
  namespace?: string;
  /** Extra attempts for transient failures of idempotent reads and writes. */
  retries?: number;
  /** Consecutive failures that open the circuit breaker. */
  failureThreshold?: number;
  /** While open, calls fail immediately instead of waiting on a dead backend. */
  cooldownMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Receives (throttled) failure reports. Defaults to the console. */
  onError?: (message: string, error: unknown) => void;
};

const LOG_INTERVAL_MS = 10_000;

/**
 * Application-facing cache over any `CacheStore`.
 *
 * Two error policies, chosen per method:
 * - **Soft** (`get`, `set`, `del`, `getOrSet`, `getCounter`): a cache outage never breaks the request.
 *   Reads behave like misses and writes are best-effort, so callers fall back to the source of truth.
 * - **Strict** (`incr`, `setIfAbsent`): used for rate limits and replay protection, where a silent failure
 *   would hide a real problem. They throw `CacheUnavailableError` and the caller decides (usually fail open).
 *
 * A circuit breaker trips after repeated failures so a down Redis costs one fast rejection, not a timeout per request.
 */
export class Cache {
  private readonly namespace: string;
  private readonly retries: number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly sleep?: (ms: number) => Promise<void>;
  private readonly onError: (message: string, error: unknown) => void;

  private consecutiveFailures = 0;
  private openUntil = 0;
  private lastLoggedAt = -Infinity;
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: CacheStore,
    options: CacheOptions = {},
  ) {
    this.namespace = options.namespace ?? "";
    this.retries = options.retries ?? 1;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 10_000;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep;
    this.onError = options.onError ?? ((message, error) => console.error(`[cache] ${message}`, error));
  }

  /** Reads and JSON-parses a value. Resolves to `null` on a miss, a corrupt value, or any backend failure. */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.run("get", () => this.store.get(this.key(key)), { retryable: true });
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (error) {
      if (!CacheUnavailableError.is(error)) await this.del(key); // unparseable value: evict it
      return null;
    }
  }

  /** JSON-serialises and stores a value. Resolves to whether it was stored. */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
    try {
      const raw = JSON.stringify(value);
      if (raw === undefined) return false;
      await this.run("set", () => this.store.set(this.key(key), raw, ttlSeconds), { retryable: true });
      return true;
    } catch {
      return false;
    }
  }

  /** Best-effort delete (e.g. to invalidate). Resolves to whether the backend confirmed it. */
  async del(...keys: string[]): Promise<boolean> {
    if (keys.length === 0) return true;
    try {
      await this.run("del", () => this.store.del(...keys.map((key) => this.key(key))), { retryable: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cache-aside read: returns the cached value, otherwise runs `loader`, caches its result and returns it.
   * Concurrent calls for one key in this process share a single loader run (no thundering herd).
   * `null`/`undefined` results are not cached. If the cache is down the loader still runs.
   */
  getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const pending = (async () => {
      const cached = await this.get<T>(key);
      if (cached !== null) return cached;
      const value = await loader();
      if (value !== null && value !== undefined) await this.set(key, value, ttlSeconds);
      return value;
    })().finally(() => this.inflight.delete(key));

    this.inflight.set(key, pending);
    return pending;
  }

  /** Reads a counter written by `incr` without changing it. Resolves to null when missing or the backend fails. */
  async getCounter(key: string): Promise<CounterState | null> {
    try {
      return await this.run("getCounter", () => this.store.counter(this.key(key)), { retryable: true });
    } catch {
      return null;
    }
  }

  /** Strict. Atomically increments a windowed counter (see `CacheStore.incr`). */
  incr(key: string, ttlSeconds: number): Promise<CounterState> {
    // Not retried: a timed-out INCR may already have been applied, and counting twice would be worse.
    return this.run("incr", () => this.store.incr(this.key(key), ttlSeconds), { retryable: false });
  }

  /** Strict. Stores a marker only if absent; resolves to whether this call stored it (a one-time-use check). */
  setIfAbsent(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    return this.run("setIfAbsent", () => this.store.setIfAbsent(this.key(key), JSON.stringify(value), ttlSeconds), {
      retryable: false,
    });
  }

  async isHealthy(): Promise<boolean> {
    try {
      return await this.run("ping", () => this.store.ping(), { retryable: false });
    } catch {
      return false;
    }
  }

  close(): Promise<void> {
    return this.store.close();
  }

  private key(key: string): string {
    return this.namespace ? `${this.namespace}:${key}` : key;
  }

  private async run<T>(operation: string, fn: () => Promise<T>, { retryable }: { retryable: boolean }): Promise<T> {
    if (this.now() < this.openUntil) {
      throw new CacheUnavailableError(`Cache ${operation} skipped: circuit open`);
    }

    try {
      const result = await retry(fn, {
        retries: retryable ? this.retries : 0,
        baseDelayMs: 25,
        maxDelayMs: 250,
        sleep: this.sleep,
      });
      this.consecutiveFailures = 0;
      return result;
    } catch (error) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.failureThreshold) {
        this.openUntil = this.now() + this.cooldownMs;
      }
      this.report(`${operation} failed`, error);
      throw new CacheUnavailableError(`Cache ${operation} failed`, { cause: error });
    }
  }

  /** Logs at most once per interval so an outage doesn't flood the logs. */
  private report(message: string, error: unknown): void {
    const now = this.now();
    if (now - this.lastLoggedAt < LOG_INTERVAL_MS) return;
    this.lastLoggedAt = now;
    this.onError(message, error);
  }
}
