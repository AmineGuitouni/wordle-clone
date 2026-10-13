import { randomToken, sign, verifySignature } from "./crypto";

/**
 * A device identity is a random id in a long-lived, signed, httpOnly cookie. The server only ever trusts ids it
 * signed itself, so clients cannot invent identities. The display name is just a label attached to the id.
 */
export const DEVICE_COOKIE = "gtw_did";
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function createDeviceId(): string {
  return randomToken(16); // 128 bits -> 22 base64url characters
}

export async function encodeDeviceCookie(deviceId: string, secret?: string): Promise<string> {
  return `${deviceId}.${await sign("device", deviceId, secret)}`;
}

/** Returns the device id if the cookie value carries a valid signature, otherwise null. */
export async function decodeDeviceCookie(value: string, secret?: string): Promise<string | null> {
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [deviceId, signature] = parts;
  if (!DEVICE_ID_PATTERN.test(deviceId)) return null;
  return (await verifySignature("device", deviceId, signature, secret)) ? deviceId : null;
}

export function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (name && !cookies.has(name)) cookies.set(name, part.slice(separator + 1).trim());
  }
  return cookies;
}

/** Extracts and verifies the device id from a `Cookie` header. */
export async function readDeviceId(cookieHeader: string | null, secret?: string): Promise<string | null> {
  const value = parseCookies(cookieHeader).get(DEVICE_COOKIE);
  return value ? decodeDeviceCookie(value, secret) : null;
}
