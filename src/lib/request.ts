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

/** Expands an IPv6 address into its eight 16-bit groups (an embedded IPv4 tail counts as two). */
function ipv6Groups(ip: string): string[] {
  const split = (part: string) => (part ? part.split(":") : []).flatMap((g) => (g.includes(".") ? ["0", "0"] : [g]));
  const [head, tail] = ip.split("::");
  if (tail === undefined) return split(head);
  const [left, right] = [split(head), split(tail)];
  return [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];
}

/**
 * The network a client address belongs to: the address itself for IPv4, the /64 prefix for IPv6. One IPv6
 * household or device rotates through many addresses inside its /64 (privacy extensions), so comparing full
 * IPv6 addresses would see one network as many.
 */
export function networkOf(ip: string): string | null {
  const address = ip.split("%")[0]; // drop an IPv6 zone id
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6) return null;

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped) return mapped[1];

  const prefix = ipv6Groups(address.toLowerCase())
    .slice(0, 4)
    .map((group) => parseInt(group, 16).toString(16));
  return `${prefix.join(":")}::/64`;
}
