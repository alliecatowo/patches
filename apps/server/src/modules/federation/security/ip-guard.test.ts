import { describe, expect, it } from 'vitest';

import { isDisallowedIp } from './ip-guard.js';

describe('isDisallowedIp', () => {
  it('always allows everything when allowPrivateNetworks is set (lab mode)', () => {
    expect(isDisallowedIp('127.0.0.1', true)).toBe(false);
    expect(isDisallowedIp('10.0.0.1', true)).toBe(false);
  });

  it.each([
    ['127.0.0.1', 'loopback'],
    ['10.1.2.3', 'RFC 1918 10/8'],
    ['172.16.0.1', 'RFC 1918 172.16/12'],
    ['192.168.1.1', 'RFC 1918 192.168/16'],
    ['169.254.1.1', 'link-local'],
    ['100.64.0.1', 'CGNAT'],
    ['0.0.0.0', 'this-network'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'reserved'],
  ])('rejects %s (%s) when allowPrivateNetworks is false', (ip) => {
    expect(isDisallowedIp(ip, false)).toBe(true);
  });

  it('allows a public IPv4 address', () => {
    expect(isDisallowedIp('93.184.216.34', false)).toBe(false);
  });

  it.each([
    ['::1', 'loopback'],
    ['::', 'unspecified'],
    ['fe80::1', 'link-local'],
    ['fc00::1', 'unique-local'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
  ])('rejects IPv6 %s (%s) when allowPrivateNetworks is false', (ip) => {
    expect(isDisallowedIp(ip, false)).toBe(true);
  });

  it('allows a public IPv6 address', () => {
    expect(isDisallowedIp('2606:2800:220:1:248:1893:25c8:1946', false)).toBe(false);
  });
});
