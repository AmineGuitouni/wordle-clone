import { describe, expect, it, vi } from "vitest";
import { backoffDelayMs, retry } from "./retry";

const noSleep = () => Promise.resolve();

describe("backoffDelayMs", () => {
  it("grows exponentially up to the cap when jitter is off", () => {
    const delays = [0, 1, 2, 3, 4, 5].map((attempt) =>
      backoffDelayMs(attempt, { baseDelayMs: 100, maxDelayMs: 1_000, jitter: false }),
    );
    expect(delays).toEqual([100, 200, 400, 800, 1_000, 1_000]);
  });

  it("applies full jitter between 0 and the ceiling", () => {
    expect(backoffDelayMs(2, { baseDelayMs: 100, jitter: true, random: () => 0 })).toBe(0);
    expect(backoffDelayMs(2, { baseDelayMs: 100, jitter: true, random: () => 0.5 })).toBe(200);
    expect(backoffDelayMs(2, { baseDelayMs: 100, jitter: true, random: () => 0.999 })).toBe(399);
  });
});

describe("retry", () => {
  it("returns the first successful result without retrying", async () => {
    const operation = vi.fn().mockResolvedValue("ok");
    await expect(retry(operation, { sleep: noSleep })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries failures until one succeeds", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue("ok");
    await expect(retry(operation, { retries: 2, sleep: noSleep })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("rethrows the last error once retries are exhausted", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("still broken"));
    await expect(retry(operation, { retries: 2, sleep: noSleep })).rejects.toThrow("still broken");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("gives up immediately when shouldRetry declines", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("fatal"));
    await expect(retry(operation, { retries: 5, shouldRetry: () => false, sleep: noSleep })).rejects.toThrow("fatal");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("sleeps with growing delays and reports each retry", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn();
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("b"))
      .mockResolvedValue(1);

    await retry(operation, { retries: 3, baseDelayMs: 10, jitter: false, sleep, onRetry });

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([10, 20]);
    expect(onRetry.mock.calls.map(([, attempt, delay]) => [attempt, delay])).toEqual([
      [1, 10],
      [2, 20],
    ]);
  });

  it("passes the attempt number to the operation", async () => {
    const seen: number[] = [];
    await retry(
      async (attempt) => {
        seen.push(attempt);
        if (attempt < 2) throw new Error("again");
      },
      { sleep: noSleep },
    );
    expect(seen).toEqual([0, 1, 2]);
  });
});
