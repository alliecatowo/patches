import { describe, expect, it } from 'vitest';

import { peerBucket } from './peer-bucket.js';

describe('peerBucket', () => {
  it('keeps IPv4 as is and unwraps IPv4-mapped IPv6', () => {
    expect(peerBucket('203.0.113.9')).toBe('203.0.113.9');
    expect(peerBucket('::ffff:203.0.113.9')).toBe('203.0.113.9');
  });

  it('aggregates an IPv6 address to its /64', () => {
    const a = peerBucket('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    const b = peerBucket('2001:db8:1:2:1111:2222:3333:4444');
    expect(a).toBe('2001:db8:1:2::/64');
    expect(b).toBe(a);
    expect(peerBucket('2001:db8:1:3::1')).not.toBe(a);
  });

  it('expands :: compression before taking the prefix', () => {
    expect(peerBucket('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(peerBucket('::1')).toBe('0:0:0:0::/64');
  });

  it('puts unidentifiable callers in one shared bucket', () => {
    expect(peerBucket(undefined)).toBe('unknown');
    expect(peerBucket('not an ip')).toBe('unknown');
  });
});
