import { describe, expect, it } from "vitest";
import { provisionalReason, type RankingFacts } from "./ranking";

const wordStartedAt = new Date("2026-10-13T00:00:00Z");
const before = new Date("2026-10-10T12:00:00Z");
const after = new Date("2026-10-13T08:00:00Z");

const facts = (overrides: Partial<RankingFacts>): RankingFacts => ({
  identityCreatedAt: before,
  wordStartedAt,
  hasFinishedBefore: true,
  networkAlreadyFinished: false,
  ...overrides,
});

describe("provisionalReason", () => {
  it("ranks an established player", () => {
    expect(provisionalReason(facts({}))).toBeNull();
  });

  it("ranks identities that predate tracking", () => {
    expect(provisionalReason(facts({ identityCreatedAt: null, hasFinishedBefore: false }))).toBeNull();
  });

  it("does not rank an identity created after the word went live (the clear-cookies retry)", () => {
    expect(provisionalReason(facts({ identityCreatedAt: after }))).toBe("new_identity");
    expect(provisionalReason(facts({ identityCreatedAt: after, hasFinishedBefore: false }))).toBe("new_identity");
  });

  it("ranks an identity created at the very moment the word went live", () => {
    expect(provisionalReason(facts({ identityCreatedAt: wordStartedAt }))).toBeNull();
  });

  it("does not rank an unused identity on a network where someone already finished (a spare identity)", () => {
    expect(provisionalReason(facts({ hasFinishedBefore: false, networkAlreadyFinished: true }))).toBe("shared_network");
  });

  it("ranks regulars who share a network", () => {
    expect(provisionalReason(facts({ hasFinishedBefore: true, networkAlreadyFinished: true }))).toBeNull();
  });

  it("ranks an unused older identity when nobody else on its network finished", () => {
    expect(provisionalReason(facts({ hasFinishedBefore: false, networkAlreadyFinished: false }))).toBeNull();
  });
});
