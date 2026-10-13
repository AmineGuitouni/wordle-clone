import { describe, expect, it } from "vitest";
import { checkProof, countLeadingZeroBits, solveProof } from "./pow";

describe("countLeadingZeroBits", () => {
  it.each([
    [[0b1000_0000], 0],
    [[0b0100_0000], 1],
    [[0b0000_0001], 7],
    [[0, 0b0010_0000], 10],
    [[0, 0, 0xff], 16],
    [[0, 0], 16],
    [[], 0],
  ])("%j -> %i", (bytes, expected) => {
    expect(countLeadingZeroBits(Uint8Array.from(bytes))).toBe(expected);
  });
});

describe("proof of work", () => {
  it("finds a nonce that checkProof accepts", async () => {
    const nonce = await solveProof("salt-a", 10);
    expect(await checkProof("salt-a", nonce, 10)).toBe(true);
  });

  it("does not accept the same nonce for a different salt (almost always)", async () => {
    const nonce = await solveProof("salt-a", 12);
    expect(await checkProof("salt-a", nonce, 12)).toBe(true);
    // A different salt shares the nonce with probability 2^-12 per try; pick one that doesn't.
    const results = await Promise.all(["x", "y", "z", "w"].map((salt) => checkProof(salt, nonce, 12)));
    expect(results.filter(Boolean).length).toBeLessThanOrEqual(1);
  });

  it("needs real work: harder puzzles need more attempts on average", async () => {
    const easy = await Promise.all(Array.from({ length: 20 }, (_, i) => solveProof(`e${i}`, 4)));
    const hard = await Promise.all(Array.from({ length: 20 }, (_, i) => solveProof(`h${i}`, 10)));
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean(hard)).toBeGreaterThan(mean(easy));
  });

  it("can be aborted", async () => {
    const controller = new AbortController();
    const pending = solveProof("salt", 40, controller.signal); // practically unsolvable
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
