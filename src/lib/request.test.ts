import { describe, expect, it } from "vitest";
import { getClientIp, networkOf } from "./request";

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

describe("networkOf", () => {
  it("keeps IPv4 addresses as they are", () => {
    expect(networkOf("203.0.113.7")).toBe("203.0.113.7");
  });

  it("reduces IPv6 to its /64, so rotating privacy addresses stay one network", () => {
    const a = networkOf("2001:db8:85a3:12::8a2e:370:7334");
    const b = networkOf("2001:0DB8:85a3:0012:1:2:3:4");
    expect(a).toBe("2001:db8:85a3:12::/64");
    expect(b).toBe(a);
    expect(networkOf("2001:db8:85a3:13::1")).not.toBe(a);
  });

  it("expands compressed addresses", () => {
    expect(networkOf("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(networkOf("::1")).toBe("0:0:0:0::/64");
    expect(networkOf("fe80::1%en0")).toBe("fe80:0:0:0::/64");
  });

  it("treats IPv4-mapped IPv6 as the IPv4 address", () => {
    expect(networkOf("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("rejects anything that is not an IP", () => {
    expect(networkOf("not-an-ip")).toBeNull();
    expect(networkOf("")).toBeNull();
  });
});
