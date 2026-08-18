import { describe, expect, it } from 'vitest';

import { AppError } from '../../common/errors/app-error.js';
import { RateLimitService } from './rate-limit.service.js';

/** Time is injected rather than faked globally, so these tests never sleep. */
const T0 = 1_800_000_000_000;

describe('RateLimitService', () => {
  it('allows attempts up to the window budget and then refuses', () => {
    const limiter = new RateLimitService();
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
    const limiter = new RateLimitService();
    for (let i = 0; i < 10; i += 1) limiter.consume('login', 'alice', T0);
    expect(() => {
      limiter.consume('login', 'bob', T0);
    }).not.toThrow();
  });

  it('limits each action independently', () => {
    const limiter = new RateLimitService();
    for (let i = 0; i < 5; i += 1) limiter.consume('register', 'alice', T0);
    expect(() => {
      limiter.consume('register', 'alice', T0);
    }).toThrow(AppError);
    expect(() => {
      limiter.consume('login', 'alice', T0);
    }).not.toThrow();
  });

  it('starts a fresh window once the old one elapses', () => {
    const limiter = new RateLimitService();
    for (let i = 0; i < 10; i += 1) limiter.consume('login', 'alice', T0);
    expect(() => {
      limiter.consume('login', 'alice', T0 + 5 * 60_000);
    }).not.toThrow();
  });

  it('forgets a subject after a successful attempt', () => {
    const limiter = new RateLimitService();
    for (let i = 0; i < 10; i += 1) limiter.consume('login', 'alice', T0);
    limiter.reset('login', 'alice');
    expect(() => {
      limiter.consume('login', 'alice', T0);
    }).not.toThrow();
  });

  it('keeps password reset on a much tighter budget than login', () => {
    const limiter = new RateLimitService();
    for (let i = 0; i < 5; i += 1) limiter.consume('password_reset', 'alice@example.com', T0);
    expect(() => {
      limiter.consume('password_reset', 'alice@example.com', T0);
    }).toThrow(AppError);
  });
});
