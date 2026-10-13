import { NextResponse } from "next/server";
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE_SECONDS, encodeDeviceCookie } from "./device";

/** Shared response plumbing for the identity and passkey endpoints. */
export const NO_STORE = { "Cache-Control": "no-store" };

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export function rateLimited(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "rate_limited", retryAfterSeconds },
    { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfterSeconds) } },
  );
}

const firstValue = (header: string | null) => header?.split(",")[0].trim() || null;

/** The origin the browser is on, as seen through a proxy (Vercel and most hosts set the x-forwarded-* headers). */
export function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  const protocol = firstValue(req.headers.get("x-forwarded-proto")) ?? url.protocol.replace(":", "");
  const host = firstValue(req.headers.get("x-forwarded-host")) ?? firstValue(req.headers.get("host")) ?? url.host;
  return `${protocol}://${host}`;
}

/** Issues (or refreshes) the long-lived device identity cookie. */
export async function setDeviceCookie(response: NextResponse, deviceId: string, req: Request): Promise<void> {
  response.cookies.set(DEVICE_COOKIE, await encodeDeviceCookie(deviceId), {
    httpOnly: true,
    sameSite: "lax",
    secure: requestOrigin(req).startsWith("https:"),
    path: "/",
    // Re-issued on every sign-in, so the one-year lifetime slides forward for active players.
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
  });
}
