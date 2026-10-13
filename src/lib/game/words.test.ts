import { describe, expect, it } from "vitest";
import { WORD_LENGTH } from "./rules";
import { isValidWord, pickRandomWord, WORDS } from "./words";

describe("WORDS", () => {
  it("only contains unique lowercase words of the right length", () => {
    expect(WORDS.length).toBeGreaterThan(1000);
    expect(new Set(WORDS).size).toBe(WORDS.length);
    for (const word of WORDS) {
      expect(word).toMatch(new RegExp(`^[a-z]{${WORD_LENGTH}}$`));
    }
  });
});

describe("isValidWord", () => {
  it("is case-insensitive", () => {
    expect(isValidWord("world")).toBe(true);
    expect(isValidWord("WORLD")).toBe(true);
  });

  it("rejects unknown words", () => {
    expect(isValidWord("zzzzz")).toBe(false);
  });
});

describe("pickRandomWord", () => {
  it("returns a dictionary word", () => {
    expect(isValidWord(pickRandomWord())).toBe(true);
  });

  it("never returns the excluded word", () => {
    for (let i = 0; i < 200; i++) {
      expect(pickRandomWord("world")).not.toBe("world");
    }
  });

  it("prefers words that haven't been used", () => {
    const used = new Set(WORDS.filter((word) => word !== "mount" && word !== "crane"));
    for (let i = 0; i < 50; i++) {
      expect(["mount", "crane"]).toContain(pickRandomWord("world", used));
      expect(pickRandomWord("crane", used)).toBe("mount");
    }
  });

  it("reuses words once all of them have been used, still never the previous one", () => {
    const used = new Set(WORDS);
    for (let i = 0; i < 200; i++) {
      const word = pickRandomWord("world", used);
      expect(isValidWord(word)).toBe(true);
      expect(word).not.toBe("world");
    }
  });
});
