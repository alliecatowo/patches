import { describe, expect, it } from 'vitest';

import { PeerRateLimiterService } from './peer-rate-limiter.service.js';

describe('PeerRateLimiterService', () => {
  it('keeps transport-peer and verified-origin budgets independent', () => {
    const limiter = new PeerRateLimiterService();
    const now = new Date('2026-08-22T00:00:00.000Z');

    for (let request = 0; request < 120; request += 1) {
      expect(limiter.consumeTransportPeer('203.0.113.8', now)).toBe(true);
    }

    expect(limiter.consumeTransportPeer('203.0.113.8', now)).toBe(false);
    expect(limiter.consumeVerifiedOrigin('https://remote.test', now)).toBe(true);
  });

  it('resets a peer budget after the fixed window', () => {
    const limiter = new PeerRateLimiterService();
    const start = new Date('2026-08-22T00:00:00.000Z');
    for (let request = 0; request < 120; request += 1) {
      limiter.consumeVerifiedOrigin('https://remote.test', start);
    }

    expect(limiter.consumeVerifiedOrigin('https://remote.test', start)).toBe(false);
    expect(
      limiter.consumeVerifiedOrigin('https://remote.test', new Date(start.getTime() + 60_000)),
    ).toBe(true);
  });
});
