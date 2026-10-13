import { describe, expect, it } from "vitest";
import { fromBase64Url, randomToken, sign, toBase64Url, verifySignature } from "./crypto";

const SECRET = "test-secret";

describe("base64url", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });

  it("uses only URL-safe characters and no padding", () => {
    expect(toBase64Url(Uint8Array.from([251, 255, 254]))).toBe("-__-");
    expect(toBase64Url(Uint8Array.from([1]))).not.toContain("=");
  });

  it("rejects invalid input", () => {
    expect(fromBase64Url("not valid!")).toBeNull();
  });
});

describe("randomToken", () => {
  it("produces unique tokens of the expected length", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => randomToken(16)));
    expect(tokens.size).toBe(100);
    expect([...tokens][0]).toHaveLength(22);
  });
});

describe("sign / verifySignature", () => {
  it("accepts a valid signature", async () => {
    const signature = await sign("purpose", "data", SECRET);
    expect(await verifySignature("purpose", "data", signature, SECRET)).toBe(true);
  });

  it("is deterministic", async () => {
    expect(await sign("p", "d", SECRET)).toBe(await sign("p", "d", SECRET));
  });

  it("rejects changed data, a changed signature, or the wrong secret", async () => {
    const signature = await sign("purpose", "data", SECRET);
    expect(await verifySignature("purpose", "other", signature, SECRET)).toBe(false);
    expect(await verifySignature("purpose", "data", signature.slice(0, -2) + "AA", SECRET)).toBe(false);
    expect(await verifySignature("purpose", "data", signature, "another-secret")).toBe(false);
    expect(await verifySignature("purpose", "data", "!!!", SECRET)).toBe(false);
  });

  it("binds signatures to their purpose", async () => {
    const signature = await sign("device", "data", SECRET);
    expect(await verifySignature("pow", "data", signature, SECRET)).toBe(false);
  });
});
