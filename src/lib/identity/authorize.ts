import { normalizeGuestName } from "@/lib/validation";
import { readDeviceId } from "./device";

/**
 * Auth.js `authorize` for the guest provider. A guest can only sign in with a device cookie the server signed
 * (issued by /api/identity after the proof-of-work), and the session id is that device id. Rejects everything else.
 */
export async function authorizeGuest(
  credentials: Partial<Record<string, unknown>> | undefined,
  request: Request,
): Promise<{ id: string; name: string } | null> {
  const name = normalizeGuestName(credentials?.name);
  if (!name) return null;

  const deviceId = await readDeviceId(request.headers.get("cookie"));
  return deviceId ? { id: deviceId, name } : null;
}
