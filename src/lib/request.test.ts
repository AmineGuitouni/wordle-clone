import { describe, expect, it } from "vitest";
import { getClientIp } from "./request";

const headers = (init: Record<string, string>) => new Headers(init);

describe("getClientIp", () => {
  it("prefers x-real-ip", () => {
    expect(getClientIp(headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.7");
  });

  it("uses the first address of x-forwarded-for", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1, 10.0.0.2" }))).toBe("198.51.100.1");
  });

  it("supports IPv6", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("ignores values that are not IP addresses", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "not-an-ip" }))).toBeNull();
    expect(getClientIp(headers({ "x-real-ip": "<script>" }))).toBeNull();
  });

  it("returns null without proxy headers", () => {
    expect(getClientIp(headers({}))).toBeNull();
  });
});
