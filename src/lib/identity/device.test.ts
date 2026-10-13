import { describe, expect, it } from "vitest";
import {
  createDeviceId,
  DEVICE_COOKIE,
  decodeDeviceCookie,
  encodeDeviceCookie,
  parseCookies,
  readDeviceId,
} from "./device";

const SECRET = "test-secret";

describe("device cookie", () => {
  it("creates unique 22-character ids", () => {
    const id = createDeviceId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(createDeviceId()).not.toBe(id);
  });

  it("round-trips an id through its signed cookie value", async () => {
    const id = createDeviceId();
    expect(await decodeDeviceCookie(await encodeDeviceCookie(id, SECRET), SECRET)).toBe(id);
  });

  it("rejects a tampered id, a forged signature, and a different secret", async () => {
    const id = createDeviceId();
    const value = await encodeDeviceCookie(id, SECRET);
    const [, signature] = value.split(".");

    expect(await decodeDeviceCookie(`${createDeviceId()}.${signature}`, SECRET)).toBeNull();
    expect(await decodeDeviceCookie(`${id}.forged`, SECRET)).toBeNull();
    expect(await decodeDeviceCookie(value, "other-secret")).toBeNull();
  });

  it.each([[""], ["no-dot"], ["a.b.c"], ["short.sig"], [".sig"], ["x".repeat(22) + "."]])(
    "rejects malformed value %p",
    async (value) => {
      expect(await decodeDeviceCookie(value, SECRET)).toBeNull();
    },
  );
});

describe("parseCookies", () => {
  it("parses a Cookie header", () => {
    const cookies = parseCookies("a=1; b=two; c=x=y");
    expect(cookies.get("a")).toBe("1");
    expect(cookies.get("b")).toBe("two");
    expect(cookies.get("c")).toBe("x=y");
  });

  it("keeps the first of duplicate names and handles empty input", () => {
    expect(parseCookies("a=1; a=2").get("a")).toBe("1");
    expect(parseCookies(null).size).toBe(0);
    expect(parseCookies("garbage").size).toBe(0);
  });
});

describe("readDeviceId", () => {
  it("reads a valid device cookie among others", async () => {
    const id = createDeviceId();
    const header = `theme=dark; ${DEVICE_COOKIE}=${await encodeDeviceCookie(id, SECRET)}; other=1`;
    expect(await readDeviceId(header, SECRET)).toBe(id);
  });

  it("returns null when absent or forged", async () => {
    expect(await readDeviceId("theme=dark", SECRET)).toBeNull();
    expect(await readDeviceId(null, SECRET)).toBeNull();
    expect(await readDeviceId(`${DEVICE_COOKIE}=${createDeviceId()}.forged`, SECRET)).toBeNull();
  });
});
