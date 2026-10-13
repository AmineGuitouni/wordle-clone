import { Redis } from "ioredis";
import { backoffDelayMs } from "@/lib/retry";
import type { CacheStore, CounterState } from "./types";

// INCR and EXPIRE in one atomic step, so a crash can never leave a counter without an expiry (and block forever).
const INCR_WITH_TTL = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('TTL', KEYS[1])}
`;

declare module "ioredis" {
  interface RedisCommander<Context> {
    incrWithTtl(key: string, ttlSeconds: number): Promise<[number, number]>;
  }
}

export type RedisStoreOptions = {
  url: string;
  /** Per-command timeout, so a hung Redis fails fast instead of stalling requests. */
  commandTimeoutMs?: number;
  connectTimeoutMs?: number;
  /** Called for connection-level errors. ioredis keeps reconnecting in the background regardless. */
  onError?: (error: Error) => void;
};

export class RedisStore implements CacheStore {
  private readonly client: Redis;

  constructor({ url, commandTimeoutMs = 700, connectTimeoutMs = 2_000, onError }: RedisStoreOptions) {
    this.client = new Redis(url, {
      connectTimeout: connectTimeoutMs,
      commandTimeout: commandTimeoutMs,
      // Commands fail after this many failed reconnects instead of queueing forever.
      maxRetriesPerRequest: 1,
      // Reconnect forever with capped exponential backoff and jitter.
      retryStrategy: (attempt) => backoffDelayMs(attempt, { baseDelayMs: 100, maxDelayMs: 5_000 }) + 50,
      // After a failover the old primary answers READONLY; reconnect to find the new one.
      reconnectOnError: (error) => error.message.includes("READONLY"),
    });
    this.client.defineCommand("incrWithTtl", { numberOfKeys: 1, lua: INCR_WITH_TTL });
    // Without a listener, ioredis would print every connection error as "Unhandled error event".
    this.client.on("error", (error) => onError?.(error));
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds === undefined) await this.client.set(key, value);
    else await this.client.set(key, value, "EX", ttlSeconds);
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client.set(key, value, "EX", ttlSeconds, "NX")) === "OK";
  }

  del(...keys: string[]): Promise<number> {
    return keys.length > 0 ? this.client.del(...keys) : Promise.resolve(0);
  }

  async incr(key: string, ttlSeconds: number): Promise<CounterState> {
    const [count, ttl] = await this.client.incrWithTtl(key, ttlSeconds);
    return { count, ttlSeconds: Math.max(1, ttl) };
  }

  async counter(key: string): Promise<CounterState | null> {
    const replies = await this.client.multi().get(key).ttl(key).exec();
    const [[getError, raw], [ttlError, ttl]] = replies ?? [
      [null, null],
      [null, -2],
    ];
    if (getError) throw getError;
    if (ttlError) throw ttlError;
    const count = Number(raw);
    if (raw === null || !Number.isFinite(count)) return null;
    return { count, ttlSeconds: Math.max(0, Number(ttl)) };
  }

  async ping(): Promise<boolean> {
    return (await this.client.ping()) === "PONG";
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
