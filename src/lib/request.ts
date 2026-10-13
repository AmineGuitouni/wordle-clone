import { isIP } from "node:net";

/**
 * Best-effort client IP behind a reverse proxy. `x-real-ip` / `x-forwarded-for` are only trustworthy when your
 * host overwrites them (Vercel and most managed platforms do); behind a bare Node server they can be spoofed.
 * Returns null when no valid address is present (e.g. local development), so callers can skip IP-based limits.
 */
export function getClientIp(headers: Headers): string | null {
  const candidates = [headers.get("x-real-ip"), headers.get("x-forwarded-for")?.split(",")[0]];
  for (const candidate of candidates) {
    const ip = candidate?.trim();
    if (ip && isIP(ip)) return ip;
  }
  return null;
}
