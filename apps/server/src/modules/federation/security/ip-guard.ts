/**
 * SSRF IP-range guard (P8-006, `INITIAL_VISION.md` §109: "reject private/reserved IP
 * ranges", "defend against DNS rebinding"). Pure/no I/O so it is trivially unit-testable —
 * `safe-fetch.ts` is what actually resolves DNS and calls this per candidate address.
 */

/** Parses an IPv4 dotted-quad into four octets, or `undefined` if `value` is not one. */
function parseIPv4(value: string): [number, number, number, number] | undefined {
  const parts = value.split('.');
  if (parts.length !== 4) return undefined;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const n = Number(part);
    if (n > 255) return undefined;
    octets.push(n);
  }
  return octets as [number, number, number, number];
}

/**
 * RFC 1918 private ranges, loopback, link-local, CGNAT (RFC 6598), "this network" (0.0.0.0/8),
 * multicast, and reserved (240.0.0.0/4) — the ranges a legitimate public ActivityPub peer
 * never resolves to.
 */
function isDisallowedIPv4(octets: readonly [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC 1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT, RFC 6598
  if (a >= 224) return true; // multicast (224-239) + reserved (240-255)
  return false;
}

/** IPv6 loopback (`::1`), unique-local (`fc00::/7`), link-local (`fe80::/10`), and unspecified
 * (`::`) — plus unwraps an IPv4-mapped address (`::ffff:a.b.c.d`) to check the embedded IPv4. */
function isDisallowedIPv6(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped?.[1] !== undefined) {
    const v4 = parseIPv4(mapped[1]);
    return v4 !== undefined && isDisallowedIPv4(v4);
  }
  const firstGroup = normalized.split(':')[0] ?? '';
  if (firstGroup.length === 0) return false;
  const value16 = Number.parseInt(firstGroup.padEnd(4, '0').slice(0, 4), 16);
  if (Number.isNaN(value16)) return false;
  // fc00::/7 -> first 7 bits are 1111110x -> top byte in [0xfc, 0xfd]
  const topByte = (value16 >> 8) & 0xff;
  if (topByte === 0xfc || topByte === 0xfd) return true;
  // fe80::/10 -> top 10 bits fixed -> value16 in [0xfe80, 0xfebf]
  if (value16 >= 0xfe80 && value16 <= 0xfebf) return true;
  return false;
}

/** `true` when `ip` (already-resolved, dotted-quad or colon-form) must never be connected to
 * unless `allowPrivateNetworks` is set (the two-node lab, non-production only). */
export function isDisallowedIp(ip: string, allowPrivateNetworks: boolean): boolean {
  if (allowPrivateNetworks) return false;
  const v4 = parseIPv4(ip);
  if (v4 !== undefined) return isDisallowedIPv4(v4);
  return isDisallowedIPv6(ip);
}
