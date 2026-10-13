import type { CacheStore, CounterState } from "./types";

type Entry = { value: string; expiresAt: number | null };

/**
 * In-process store with TTL support. It backs local development and tests, and is the fallback when no
 * Redis is configured. State is per process, so in production with several instances use Redis instead.
 */
export class MemoryStore implements CacheStore {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 10_000,
  ) {}

  async get(key: string): Promise<string | null> {
    return this.read(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.write(key, value, ttlSeconds === undefined ? null : this.now() + ttlSeconds * 1000);
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.read(key)) return false;
    this.write(key, value, this.now() + ttlSeconds * 1000);
    return true;
  }

  async del(...keys: string[]): Promise<number> {
    return keys.filter((key) => this.read(key) && this.entries.delete(key)).length;
  }

  async incr(key: string, ttlSeconds: number): Promise<CounterState> {
    const existing = this.read(key);
    const expiresAt = existing?.expiresAt ?? this.now() + ttlSeconds * 1000;
    const previous = Number(existing?.value);
    const count = Number.isFinite(previous) ? previous + 1 : 1;
    this.write(key, String(count), expiresAt);
    return { count, ttlSeconds: this.secondsLeft(expiresAt) };
  }

  async counter(key: string): Promise<CounterState | null> {
    const entry = this.read(key);
    const count = Number(entry?.value);
    if (!entry || !Number.isFinite(count)) return null;
    return { count, ttlSeconds: this.secondsLeft(entry.expiresAt) };
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    this.entries.clear();
  }

  private secondsLeft(expiresAt: number | null): number {
    return expiresAt === null ? 0 : Math.max(1, Math.ceil((expiresAt - this.now()) / 1000));
  }

  private read(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  private write(key: string, value: string, expiresAt: number | null): void {
    this.entries.delete(key); // re-insert so Map iteration order stays oldest-first
    this.entries.set(key, { value, expiresAt });
    if (this.entries.size > this.maxEntries) this.evict();
  }

  private evict(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) this.entries.delete(key);
    }
    // Still over the limit: drop the oldest entries.
    for (const key of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) break;
      this.entries.delete(key);
    }
  }
}
