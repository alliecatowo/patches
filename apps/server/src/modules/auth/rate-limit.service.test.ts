import { describe, expect, it } from 'vitest';

import { AppError } from '../../common/errors/app-error.js';
import { type DbRateLimitStore } from './db-rate-limit-store.service.js';
import { RateLimitService } from './rate-limit.service.js';

/** Time is injected rather than faked globally, so these tests never sleep. */
const T0 = 1_800_000_000_000;

/**
 * A-018: these tests exercise the pre-existing in-memory `consume`/`consumePeer` behavior
 * only, never `consumeDistributed`/`consumeDistributedPeer` — `DbRateLimitStore` needs a real
 * Postgres connection, so it is never constructed for real here. A fake that would throw if
 * ever called is enough to prove nothing in this file's assertions reaches it.
 */
function unusedDbRateLimitStore(): DbRateLimitStore {
  return {
    increment: () => {
      throw new Error('DbRateLimitStore.increment should not be called by these unit tests');
    },
  } as unknown as DbRateLimitStore;
}

describe('RateLimitService', () => {
  it('allows attempts up to the window budget and then refuses', () => {
    const limiter = new RateLimitService(unusedDbRateLimitStore());
    for (let i = 0; i < 10; i += 1) {
      expect(() => {
        limiter.consume('login', 'alice', T0);
      }).not.toThrow();
    }

    try {
      limiter.consume('login', 'alice', T0);
      expect.unreachable('expected the 11th login attempt to be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('RATE_LIMITED');
      expect((error as AppError).message).toMatch(/try again in \d+ seconds/i);
    }
  });

  it('limits each subject independently', () => {
    const limiter = new RateLimitService(unusedDbRateLimitStore());
    for (let i = 0; i < 10; i += 1) limiter.consume('login', 'alice', T0);
    expect(() => {
      limiter.consume('login', 'bob', T0);
    }).not.toThrow();
  });

  it('limits each action independently', () => {
    const limiter = new RateLimitService(unusedDbRateLimitStore());
    for (let i = 0; i < 5; i += 1) limiter.consume('register', 'alice', T0);
    expect(() => {
      limiter.consume('register', 'alice', T0);
    }).toThrow(AppError);
    expect(() => {
      limiter.consume('login', 'alice', T0);
    }).not.toThrow();
  });

  it('starts a fresh window once the old one elapses', () => {
    const limiter = new RateLimitService(unusedDbRateLimitStore());
    for (let i = 0; i < 10; i += 1) limiter.consume('login', 'alice', T0);
    expect(() => {
      limiter.consume('login', 'alice', T0 + 5 * 60_000);
    }).not.toThrow();
  });

  it('forgets a subject after a successful attempt', () => {
    const limiter = new RateLimitService(unusedDbRateLimitStore());
    for (let i = 0; i < 10; i += 1) limiter.consume('login', 'alice', T0);
    limiter.reset('login', 'alice');
    expect(() => {
      limiter.consume('login', 'alice', T0);
    }).not.toThrow();
  });

  it('keeps password reset on a much tighter budget than login', () => {
    const limiter = new RateLimitService(unusedDbRateLimitStore());
    for (let i = 0; i < 5; i += 1) limiter.consume('password_reset', 'alice@example.com', T0);
    expect(() => {
      limiter.consume('password_reset', 'alice@example.com', T0);
    }).toThrow(AppError);
  });

  describe('consumePeer', () => {
    it('throttles a single peer across any number of distinct subjects', () => {
      const limiter = new RateLimitService(unusedDbRateLimitStore());
      // `register`'s subject is caller-chosen (a fresh handle every attempt), so the subject
      // budget alone never re-hits the same bucket; the peer budget is what actually bounds
      // this caller.
      for (let i = 0; i < 40; i += 1) {
        limiter.consume('register', `handle-${String(i)}`, T0);
        limiter.consumePeer('register', '203.0.113.7', T0);
      }
      expect(() => {
        limiter.consume('register', 'handle-40', T0);
        limiter.consumePeer('register', '203.0.113.7', T0);
      }).toThrow(AppError);
    });

    it('limits each peer independently', () => {
      const limiter = new RateLimitService(unusedDbRateLimitStore());
      for (let i = 0; i < 60; i += 1) limiter.consumePeer('login', '203.0.113.7', T0);
      expect(() => {
        limiter.consumePeer('login', '203.0.113.8', T0);
      }).not.toThrow();
    });

    it('is a no-op for actions with no configured peer window', () => {
      const limiter = new RateLimitService(unusedDbRateLimitStore());
      for (let i = 0; i < 1000; i += 1) {
        expect(() => {
          limiter.consumePeer('verify_email', '203.0.113.7', T0);
        }).not.toThrow();
      }
    });

    it('shares one bucket for an unresolved peer rather than bypassing the check', () => {
      const limiter = new RateLimitService(unusedDbRateLimitStore());
      for (let i = 0; i < 60; i += 1) limiter.consumePeer('login', undefined, T0);
      expect(() => {
        limiter.consumePeer('login', undefined, T0);
      }).toThrow(AppError);
    });
  });

  describe('capacity', () => {
    it('refuses a brand-new key once full, without evicting a live victim bucket', () => {
      const limiter = new RateLimitService(unusedDbRateLimitStore());

      // A real subject, throttled up to (but not past) its own limit.
      for (let i = 0; i < 10; i += 1) limiter.consume('verify_email', 'victim', T0);

      // Flood in enough distinct junk keys to fill every remaining slot.
      for (let i = 0; i < 19_999; i += 1) {
        limiter.consume('verify_email', `flood-${String(i)}`, T0);
      }

      // If the flood had evicted `victim`'s bucket, this would silently start a fresh one
      // instead of throwing — it must not have been touched.
      expect(() => {
        limiter.consume('verify_email', 'victim', T0);
      }).toThrow(AppError);

      // A genuinely new key is refused outright rather than evicting one of the 20,000 live
      // buckets to make room for it.
      expect(() => {
        limiter.consume('verify_email', 'brand-new-key', T0);
      }).toThrow(AppError);
    });
  });
});
