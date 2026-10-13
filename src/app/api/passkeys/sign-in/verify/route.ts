import { json, rateLimited, requestOrigin, setDeviceCookie } from "@/lib/identity/http";
import { finishPasskeySignIn, relyingPartyFor } from "@/lib/identity/passkeys";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

export const dynamic = "force-dynamic";

/**
 * Step two of signing in with a passkey. A valid passkey gives this browser the identity cookie of the player who
 * saved it (their games, history and creation date come along), then the client calls `signIn("guest")` with the
 * returned name, exactly as after the regular identity flow.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { response?: unknown } | null;

  try {
    const ip = getClientIp(req.headers);
    if (ip) {
      const limit = await consumeRateLimit(RATE_LIMITS.passkeySignIns, ip);
      if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);
    }

    const player = await finishPasskeySignIn(body?.response, relyingPartyFor(requestOrigin(req)));
    if (!player) return json({ error: "invalid_passkey" }, 400);

    const response = json({ status: "ok", name: player.name });
    await setDeviceCookie(response, player.id, req);
    return response;
  } catch (error) {
    console.error("Passkey sign-in failed", error);
    return json({ error: "server_error" }, 500);
  }
}
