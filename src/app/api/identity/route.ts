import { NextResponse } from "next/server";
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE_SECONDS, encodeDeviceCookie } from "@/lib/identity/device";
import { issueIdentity } from "@/lib/identity/issue";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function isHttps(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return proto.split(",")[0].trim() === "https";
}

/**
 * Step one of guest sign-in. Establishes (or recognises) this browser's device identity and the display name;
 * the client then calls Auth.js `signIn("guest")`, which only accepts a device cookie issued here.
 *
 * Normal outcomes are all HTTP 200 so they don't show up as failed requests in the browser console:
 *   { status: "ok" }                          identity is set (cookie issued for new devices)
 *   { status: "challenge_required", challenge }   a new device must solve this proof-of-work, then repeat the
 *                                             request with { name, challenge: { token, nonce } }
 * Real problems use 4xx:
 *   400 { error }                             invalid name, or a bad / expired / reused challenge
 *   429 { error, retryAfterSeconds }          too many requests or new identities from this network
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  try {
    const result = await issueIdentity({ headers: req.headers, body });

    switch (result.kind) {
      case "identified": {
        const response = NextResponse.json({ status: "ok" }, { headers: NO_STORE });
        response.cookies.set(DEVICE_COOKIE, await encodeDeviceCookie(result.deviceId), {
          httpOnly: true,
          sameSite: "lax",
          secure: isHttps(req),
          path: "/",
          // Re-issued on every sign-in, so the one-year lifetime slides forward for active players.
          maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
        });
        return response;
      }
      case "challenge_required":
        return NextResponse.json({ status: "challenge_required", challenge: result.challenge }, { headers: NO_STORE });
      case "invalid_name":
      case "invalid_challenge":
        // The specific failure reason stays server-side: it would only help someone probing for weaknesses.
        return NextResponse.json({ error: result.kind }, { status: 400, headers: NO_STORE });
      case "rate_limited":
        return NextResponse.json(
          { error: result.kind, retryAfterSeconds: result.retryAfterSeconds },
          { status: 429, headers: { ...NO_STORE, "Retry-After": String(result.retryAfterSeconds) } },
        );
    }
  } catch (error) {
    console.error("Identity request failed", error);
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
