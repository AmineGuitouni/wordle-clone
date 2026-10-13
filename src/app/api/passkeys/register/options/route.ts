import { auth } from "@/auth";
import { json, rateLimited, requestOrigin } from "@/lib/identity/http";
import { relyingPartyFor, startPasskeyRegistration } from "@/lib/identity/passkeys";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Step one of saving a passkey for the signed-in player: the options for `navigator.credentials.create()`. */
export async function POST(req: Request) {
  const session = await auth();
  const player = session?.user?.id ? { id: session.user.id, name: session.user.name ?? "Guest" } : null;
  if (!player) return json({ error: "unauthenticated" }, 401);

  try {
    const limit = await consumeRateLimit(RATE_LIMITS.passkeyRegistrations, player.id);
    if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

    return json(await startPasskeyRegistration(player, relyingPartyFor(requestOrigin(req))));
  } catch (error) {
    console.error("Passkey registration options failed", error);
    return json({ error: "server_error" }, 500);
  }
}
