/**
 * Signing helpers built on Web Crypto only, so they run unchanged in Node route handlers, the proxy and tests.
 * Every signature is bound to a `purpose`, so a signature minted for one use can never validate for another.
 */
const encoder = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  try {
    return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export function randomToken(byteLength = 16): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function getSigningSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return secret;
}

function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function sign(purpose: string, data: string, secret = getSigningSecret()): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret, "sign"),
    encoder.encode(`${purpose}:${data}`),
  );
  return toBase64Url(new Uint8Array(signature));
}

/** Constant-time verification (delegated to `subtle.verify`). */
export async function verifySignature(
  purpose: string,
  data: string,
  signature: string,
  secret = getSigningSecret(),
): Promise<boolean> {
  const bytes = fromBase64Url(signature);
  if (!bytes) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), bytes, encoder.encode(`${purpose}:${data}`));
}
