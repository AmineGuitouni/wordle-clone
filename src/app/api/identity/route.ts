import { json, rateLimited, setDeviceCookie } from "@/lib/identity/http";
import { issueIdentity } from "@/lib/identity/issue";

export const dynamic = "force-dynamic";

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
        const response = json({ status: "ok" });
        await setDeviceCookie(response, result.deviceId, req);
        return response;
      }
      case "challenge_required":
        return json({ status: "challenge_required", challenge: result.challenge });
      case "invalid_name":
      case "invalid_challenge":
        // The specific failure reason stays server-side: it would only help someone probing for weaknesses.
        return json({ error: result.kind }, 400);
      case "rate_limited":
        return rateLimited(result.retryAfterSeconds);
    }
  } catch (error) {
    console.error("Identity request failed", error);
    return json({ error: "server_error" }, 500);
  }
}
