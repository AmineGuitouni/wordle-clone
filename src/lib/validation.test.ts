import { describe, expect, it } from "vitest";
import { normalizeGuestName } from "./validation";

describe("normalizeGuestName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeGuestName("  Ada   Lovelace ")).toBe("Ada Lovelace");
  });

  it("accepts unicode letters", () => {
    expect(normalizeGuestName("Amine Ben Ali")).toBe("Amine Ben Ali");
    expect(normalizeGuestName("Zoë")).toBe("Zoë");
  });

  it.each([[""], ["a"], ["x".repeat(25)], ["<script>"], ["  "], [null], [123]])("rejects %p", (input) => {
    expect(normalizeGuestName(input)).toBeNull();
  });
});
