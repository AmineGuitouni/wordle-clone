import { auth } from "@/auth";
import { json, rateLimited, requestOrigin } from "@/lib/identity/http";
import { finishPasskeyRegistration, relyingPartyFor } from "@/lib/identity/passkeys";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Step two of saving a passkey: verifies the browser's response and stores the new credential. */
export async function POST(req: Request) {
  const session = await auth();
  const player = session?.user?.id ? { id: session.user.id, name: session.user.name ?? "Guest" } : null;
  if (!player) return json({ error: "unauthenticated" }, 401);

  const body = (await req.json().catch(() => null)) as { response?: unknown } | null;

  try {
    const limit = await consumeRateLimit(RATE_LIMITS.passkeyRegistrations, player.id);
    if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

    const saved = await finishPasskeyRegistration(player, body?.response, relyingPartyFor(requestOrigin(req)));
    return saved ? json({ status: "ok" }) : json({ error: "invalid_passkey" }, 400);
  } catch (error) {
    console.error("Passkey registration failed", error);
    return json({ error: "server_error" }, 500);
  }
}
