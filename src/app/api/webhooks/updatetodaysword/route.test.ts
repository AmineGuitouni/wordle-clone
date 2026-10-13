import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rotateTodaysWord = vi.fn();
vi.mock("@/lib/game/service", () => ({ rotateTodaysWord: () => rotateTodaysWord() }));

import { GET, POST } from "./route";

const URL = "http://localhost:3000/api/webhooks/updatetodaysword";
const request = (method: string, headers: Record<string, string> = {}) => new Request(URL, { method, headers });

describe("daily word webhook", () => {
  beforeEach(() => {
    vi.stubEnv("WEBHOOK_SECRET_KEY", "s3cret");
    rotateTodaysWord.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("accepts the GET with a bearer token that Vercel Cron sends", async () => {
    const response = await GET(request("GET", { authorization: "Bearer s3cret" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rotateTodaysWord).toHaveBeenCalledTimes(1);
  });

  it("accepts a POST with the key header", async () => {
    expect((await POST(request("POST", { key: "s3cret" }))).status).toBe(200);
    expect(rotateTodaysWord).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no credentials", {}],
    ["a wrong bearer token", { authorization: "Bearer nope" }],
    ["a wrong key header", { key: "nope" }],
  ])("rejects %s without rotating", async (_label, headers) => {
    expect((await GET(request("GET", headers))).status).toBe(401);
    expect(rotateTodaysWord).not.toHaveBeenCalled();
  });

  it("rejects everything when no secret is configured", async () => {
    vi.stubEnv("WEBHOOK_SECRET_KEY", "");
    expect((await GET(request("GET", { authorization: "Bearer " }))).status).toBe(401);
    expect((await GET(request("GET", { key: "" }))).status).toBe(401);
    expect(rotateTodaysWord).not.toHaveBeenCalled();
  });

  it("reports a failed rotation as a 500 so the cron run shows as failed", async () => {
    rotateTodaysWord.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await GET(request("GET", { authorization: "Bearer s3cret" }))).status).toBe(500);
  });
});
