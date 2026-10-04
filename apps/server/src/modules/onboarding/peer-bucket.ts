import { isIPv4, isIPv6 } from 'node:net';

/**
 * Collapses a caller address into the key a per-peer budget is counted against.
 *
 * IPv4 is used as is. An IPv6 address is aggregated to its /64, because one subscriber is
 * handed an entire /64 (or more) and could otherwise mint a fresh "peer" per request out of
 * their own prefix. An IPv4-mapped IPv6 address (`::ffff:1.2.3.4`) is the IPv4 address it wraps.
 * Anything that is not an IP at all (or `undefined`) shares one bucket, so a caller that
 * cannot be identified is throttled together instead of bypassing the limit.
 */
export function peerBucket(peer: string | undefined): string {
  if (peer === undefined) return 'unknown';
  const address = peer.trim().replace(/^\[|\]$/g, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped?.[1] !== undefined) return mapped[1];
  if (isIPv4(address)) return address;
  if (!isIPv6(address)) return 'unknown';
  const hextets = expandIpv6(address);
  return `${hextets.slice(0, 4).join(':')}::/64`;
}

/** Expands any valid IPv6 literal to eight lowercase, zero-padded-free hextets. */
function expandIpv6(address: string): string[] {
  const withoutZone = address.split('%')[0] ?? address;
  const [head = '', tail] = withoutZone.split('::');
  const headParts = head === '' ? [] : head.split(':');
  const tailParts = tail === undefined || tail === '' ? [] : tail.split(':');
  const missing = tail === undefined ? 0 : 8 - headParts.length - tailParts.length;
  const parts = [...headParts, ...Array<string>(Math.max(0, missing)).fill('0'), ...tailParts];
  return parts.map((part) => (Number.parseInt(part, 16) || 0).toString(16));
}
