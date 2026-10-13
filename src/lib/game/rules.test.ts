import { describe, expect, it } from "vitest";
import {
  buildShareText,
  evaluateGuess,
  getGameStatus,
  getKeyStates,
  isWin,
  normalizeGuess,
  type TileState,
} from "./rules";

const C: TileState = "correct";
const P: TileState = "present";
const A: TileState = "absent";

describe("evaluateGuess", () => {
  it("marks an exact match as all correct", () => {
    expect(evaluateGuess("CRANE", "crane")).toEqual([C, C, C, C, C]);
  });

  it("marks letters that are not in the answer as absent", () => {
    expect(evaluateGuess("FUZZY", "crane")).toEqual([A, A, A, A, A]);
  });

  it("marks misplaced letters as present", () => {
    expect(evaluateGuess("NACRE", "crane")).toEqual([P, P, P, P, C]);
  });

  it("only marks a duplicate letter present as often as the answer contains it", () => {
    // ABIDE has a single E: the first E of SPEED is present, the second is absent.
    expect(evaluateGuess("SPEED", "abide")).toEqual([A, A, P, A, P]);
    // HELLO has two Ls, so both Ls in LLAMA are present, while the As and M are absent.
    expect(evaluateGuess("LLAMA", "hello")).toEqual([P, P, A, A, A]);
  });

  it("gives green priority over yellow for duplicate letters", () => {
    // The E in position 5 is an exact match, which uses up APPLE's only E.
    expect(evaluateGuess("ALLEE", "apple")).toEqual([C, P, A, A, C]);
  });

  it("finds present letters that sit before the guessed position in the answer", () => {
    // Regression: letters were only searched for from the guess position onwards.
    expect(evaluateGuess("TRAIN", "about")).toEqual([P, A, P, A, A]);
  });
});

describe("getGameStatus", () => {
  const miss: TileState[] = [A, A, A, A, A];
  const win: TileState[] = [C, C, C, C, C];

  it("is playing until the player wins or runs out of attempts", () => {
    expect(getGameStatus([])).toBe("playing");
    expect(getGameStatus([miss, miss, miss])).toBe("playing");
  });

  it("is won as soon as the last guess is fully correct", () => {
    expect(getGameStatus([miss, win])).toBe("won");
    expect(isWin(win)).toBe(true);
    expect(isWin(miss)).toBe(false);
  });

  it("is lost after six misses", () => {
    expect(getGameStatus(Array(6).fill(miss))).toBe("lost");
  });

  it("counts a win on the final attempt as won", () => {
    expect(getGameStatus([miss, miss, miss, miss, miss, win])).toBe("won");
  });
});

describe("getKeyStates", () => {
  it("keeps the best known state for each letter", () => {
    const keys = getKeyStates(
      ["SPEED", "CRANE"],
      [
        [A, A, P, A, P],
        [A, A, A, A, C],
      ],
    );
    expect(keys.E).toBe(C); // present in guess 1, correct in guess 2
    expect(keys.D).toBe(P);
    expect(keys.S).toBe(A);
    expect(keys.Q).toBeUndefined();
  });

  it("never downgrades a letter", () => {
    const keys = getKeyStates(
      ["EERIE", "EXTRA"],
      [
        [C, A, A, A, A],
        [A, A, A, A, A],
      ],
    );
    expect(keys.E).toBe(C);
  });
});

describe("normalizeGuess", () => {
  it("uppercases and trims valid guesses", () => {
    expect(normalizeGuess(" crane ")).toBe("CRANE");
  });

  it.each([["cran"], ["cranes"], ["cr4ne"], ["cr ne"], [""], [null], [42], [undefined]])("rejects %p", (input) => {
    expect(normalizeGuess(input)).toBeNull();
  });
});

describe("buildShareText", () => {
  it("renders an emoji grid without revealing letters", () => {
    const text = buildShareText(
      [
        [A, P, A, A, C],
        [C, C, C, C, C],
      ],
      "won",
    );
    expect(text).toBe("Guess the Word 2/6\n\n⬛🟨⬛⬛🟩\n🟩🟩🟩🟩🟩");
  });

  it("uses X for a lost game", () => {
    expect(buildShareText(Array(6).fill([A, A, A, A, A]), "lost")).toContain("X/6");
  });
});
