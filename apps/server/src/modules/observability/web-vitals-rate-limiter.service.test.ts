import { describe, expect, it } from 'vitest';

import { WebVitalsRateLimiterService } from './web-vitals-rate-limiter.service.js';

describe('WebVitalsRateLimiterService', () => {
  it('admits requests under the per-window budget and rejects beyond it', () => {
    const limiter = new WebVitalsRateLimiterService();
    const now = new Date('2026-08-26T00:00:00Z');

    for (let i = 0; i < 60; i += 1) {
      expect(limiter.consume('203.0.113.1', now)).toBe(true);
    }
    expect(limiter.consume('203.0.113.1', now)).toBe(false);
  });

  it('tracks each peer independently', () => {
    const limiter = new WebVitalsRateLimiterService();
    const now = new Date('2026-08-26T00:00:00Z');
    for (let i = 0; i < 60; i += 1) limiter.consume('203.0.113.1', now);

    expect(limiter.consume('203.0.113.1', now)).toBe(false);
    expect(limiter.consume('203.0.113.2', now)).toBe(true);
  });

  it('resets the budget once the window elapses', () => {
    const limiter = new WebVitalsRateLimiterService();
    const start = new Date('2026-08-26T00:00:00Z');
    for (let i = 0; i < 60; i += 1) limiter.consume('203.0.113.1', start);
    expect(limiter.consume('203.0.113.1', start)).toBe(false);

    const afterWindow = new Date(start.getTime() + 60_001);
    expect(limiter.consume('203.0.113.1', afterWindow)).toBe(true);
  });
});
