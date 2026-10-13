import { afterEach, describe, expect, it, vi } from "vitest";
import { establishIdentity, type ChallengeDto } from "./client";

const challenge: ChallengeDto = { token: "tok", salt: "salt", difficulty: 4 };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const bodyOf = (fetchMock: ReturnType<typeof vi.fn>, call: number) => JSON.parse(fetchMock.mock.calls[call][1].body);

afterEach(() => vi.unstubAllGlobals());

describe("establishIdentity", () => {
  it("succeeds straight away for a returning device, without solving anything", async () => {
    const fetchMock = mockFetch(json(200, { status: "ok" }));
    const solve = vi.fn();
    expect(await establishIdentity("Ada", { solve })).toEqual({ ok: true });
    expect(solve).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("solves a challenge for a new device and resubmits with the solution", async () => {
    const fetchMock = mockFetch(json(200, { status: "challenge_required", challenge }), json(200, { status: "ok" }));
    const solve = vi.fn().mockResolvedValue(1234);
    const onChallenge = vi.fn();

    expect(await establishIdentity("Ada", { solve, onChallenge })).toEqual({ ok: true });

    expect(onChallenge).toHaveBeenCalledOnce();
    expect(solve).toHaveBeenCalledWith(challenge);
    expect(bodyOf(fetchMock, 0)).toEqual({ name: "Ada" });
    expect(bodyOf(fetchMock, 1)).toEqual({ name: "Ada", challenge: { token: "tok", nonce: 1234 } });
  });

  it("starts over with a fresh challenge when the solution is rejected", async () => {
    const fetchMock = mockFetch(
      json(200, { status: "challenge_required", challenge }),
      json(400, { error: "invalid_challenge" }),
      json(200, { status: "challenge_required", challenge: { ...challenge, token: "tok2" } }),
      json(200, { status: "ok" }),
    );
    const solve = vi.fn().mockResolvedValue(7);

    expect(await establishIdentity("Ada", { solve })).toEqual({ ok: true });
    expect(bodyOf(fetchMock, 2)).toEqual({ name: "Ada" }); // the retry carries no stale solution
    expect(bodyOf(fetchMock, 3).challenge.token).toBe("tok2");
  });

  it("reports rate limiting with the wait time", async () => {
    mockFetch(json(429, { error: "rate_limited", retryAfterSeconds: 900 }));
    expect(await establishIdentity("Ada", { solve: vi.fn() })).toEqual({
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: 900,
    });
  });

  it("reports an invalid name", async () => {
    mockFetch(json(400, { error: "invalid_name" }));
    expect(await establishIdentity("x", { solve: vi.fn() })).toEqual({ ok: false, error: "invalid_name" });
  });

  it("fails on network errors and server errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await establishIdentity("Ada", { solve: vi.fn() })).toEqual({ ok: false, error: "failed" });

    mockFetch(json(500, { error: "server_error" }));
    expect(await establishIdentity("Ada", { solve: vi.fn() })).toEqual({ ok: false, error: "failed" });
  });

  it("gives up after repeated rejected solutions instead of looping forever", async () => {
    const fetchMock = mockFetch(
      json(200, { status: "challenge_required", challenge }),
      json(400, { error: "invalid_challenge" }),
      json(200, { status: "challenge_required", challenge }),
      json(400, { error: "invalid_challenge" }),
      json(200, { status: "challenge_required", challenge }), // a third challenge is refused
    );
    const solve = vi.fn().mockResolvedValue(1);

    expect(await establishIdentity("Ada", { solve })).toEqual({ ok: false, error: "failed" });
    expect(solve).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("never makes more than a handful of requests even if the server keeps rejecting", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(400, { error: "invalid_challenge" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await establishIdentity("Ada", { solve: vi.fn() })).toEqual({ ok: false, error: "failed" });
    expect(fetchMock.mock.calls.length).toBe(6);
  });
});
