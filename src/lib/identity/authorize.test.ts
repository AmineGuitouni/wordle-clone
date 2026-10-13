import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authorizeGuest } from "./authorize";
import { DEVICE_COOKIE, createDeviceId, encodeDeviceCookie } from "./device";

const SECRET = "authorize-test-secret";
let previous: string | undefined;

beforeAll(() => {
  previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = SECRET;
});
afterAll(() => {
  if (previous === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previous;
});

const request = (cookie?: string) =>
  new Request("http://localhost/api/auth/callback/guest", { headers: cookie ? { cookie } : {} });

describe("authorizeGuest", () => {
  it("signs a guest in with a signed device cookie, using the device id as the user id", async () => {
    const id = createDeviceId();
    const cookie = `${DEVICE_COOKIE}=${await encodeDeviceCookie(id, SECRET)}`;
    expect(await authorizeGuest({ name: "  Ada   Lovelace " }, request(cookie))).toEqual({ id, name: "Ada Lovelace" });
  });

  it("keeps the same id when the same device uses a different name", async () => {
    const id = createDeviceId();
    const cookie = `${DEVICE_COOKIE}=${await encodeDeviceCookie(id, SECRET)}`;
    const first = await authorizeGuest({ name: "Alice" }, request(cookie));
    const second = await authorizeGuest({ name: "Totally Someone Else" }, request(cookie));
    expect(first?.id).toBe(second?.id);
  });

  it("rejects a missing, forged or foreign-secret device cookie", async () => {
    expect(await authorizeGuest({ name: "Alice" }, request())).toBeNull();
    expect(await authorizeGuest({ name: "Alice" }, request(`${DEVICE_COOKIE}=${createDeviceId()}.forged`))).toBeNull();
    const foreign = `${DEVICE_COOKIE}=${await encodeDeviceCookie(createDeviceId(), "someone-elses-secret")}`;
    expect(await authorizeGuest({ name: "Alice" }, request(foreign))).toBeNull();
  });

  it("rejects invalid names even with a valid cookie", async () => {
    const cookie = `${DEVICE_COOKIE}=${await encodeDeviceCookie(createDeviceId(), SECRET)}`;
    expect(await authorizeGuest({ name: "<script>" }, request(cookie))).toBeNull();
    expect(await authorizeGuest(undefined, request(cookie))).toBeNull();
  });
});
