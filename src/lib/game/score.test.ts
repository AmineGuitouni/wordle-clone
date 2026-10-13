import { describe, expect, it } from "vitest";
import { calculateScore, formatDuration } from "./score";

describe("calculateScore", () => {
  it("rewards fewer tries at equal time", () => {
    expect(calculateScore(2, 30_000)).toBeGreaterThan(calculateScore(5, 30_000));
  });

  it("rewards faster solves at equal tries", () => {
    expect(calculateScore(4, 20_000)).toBeGreaterThan(calculateScore(4, 90_000));
  });

  it("returns whole numbers", () => {
    expect(Number.isInteger(calculateScore(3, 12_345))).toBe(true);
  });
});

describe("formatDuration", () => {
  it("formats milliseconds as m:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9_400)).toBe("0:09");
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(3_600_000)).toBe("60:00");
  });

  it("never returns a negative duration", () => {
    expect(formatDuration(-500)).toBe("0:00");
  });
});
