import { json, rateLimited, requestOrigin } from "@/lib/identity/http";
import { relyingPartyFor, startPasskeySignIn } from "@/lib/identity/passkeys";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

export const dynamic = "force-dynamic";

/** Step one of signing in with a passkey: the options for `navigator.credentials.get()`. */
export async function POST(req: Request) {
  try {
    const ip = getClientIp(req.headers);
    if (ip) {
      const limit = await consumeRateLimit(RATE_LIMITS.passkeySignIns, ip);
      if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);
    }

    return json(await startPasskeySignIn(relyingPartyFor(requestOrigin(req))));
  } catch (error) {
    console.error("Passkey sign-in options failed", error);
    return json({ error: "server_error" }, 500);
  }
}
