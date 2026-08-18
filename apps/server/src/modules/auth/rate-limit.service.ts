import { Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';

/**
 * Sensitive flows that must be throttled (spec §102, `docs/architecture/auth.md` §9).
 */
export type RateLimitAction =
  | 'login'
  | 'register'
  | 'password_reset'
  | 'verify_email'
  | 'resend_verification'
  | 'ssh_challenge'
  | 'ssh_complete';

interface Window {
  limit: number;
  windowMs: number;
}

/**
 * Deliberately conservative: these guard credential-guessing and email-sending, not throughput.
 */
const WINDOWS: Readonly<Record<RateLimitAction, Window>> = Object.freeze({
  login: { limit: 10, windowMs: 5 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  password_reset: { limit: 5, windowMs: 60 * 60_000 },
  verify_email: { limit: 10, windowMs: 60 * 60_000 },
  resend_verification: { limit: 3, windowMs: 60 * 60_000 },
  ssh_challenge: { limit: 30, windowMs: 5 * 60_000 },
  ssh_complete: { limit: 20, windowMs: 5 * 60_000 },
});

/** Above this many live buckets, the oldest are dropped rather than growing without bound. */
const MAX_BUCKETS = 20_000;

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window rate limiting, **process-local** (spec §102 explicitly allows coarse
 * process-local throttles; there is no Redis in v0, §153).
 *
 * This is a v0 stopgap, not the end state: with more than one server process the effective
 * limit is multiplied by the process count, and a restart forgets every counter. §102 wants
 * the sensitive flows backed by the database before MVP — tracked as a follow-up task rather
 * than shipped half-done here, because a DB-backed limiter needs its own table, migration and
 * sweep job, all of which belong to `packages/database`.
 *
 * `Map` iteration order is insertion order, which is what makes the eviction below "oldest
 * first" without a separate LRU structure.
 */
@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  /**
   * Records one attempt and throws `RATE_LIMITED` (→ `RESOURCE_EXHAUSTED`) once the window's
   * budget is spent. `key` is the subject being limited — a peer address, a normalized handle,
   * a user id — and is never logged as-is by this service.
   */
  consume(action: RateLimitAction, key: string, now = Date.now()): void {
    const window = WINDOWS[action];
    const mapKey = `${action}:${key}`;
    const existing = this.buckets.get(mapKey);

    if (existing === undefined || existing.resetAt <= now) {
      this.prune(now);
      // Re-inserting moves the entry to the end of the map's insertion order, which keeps
      // eviction honest about which buckets are actually oldest.
      this.buckets.delete(mapKey);
      this.buckets.set(mapKey, { count: 1, resetAt: now + window.windowMs });
      return;
    }

    existing.count += 1;
    if (existing.count > window.limit) {
      const retryInSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      throw new AppError(
        'RATE_LIMITED',
        `Too many attempts. Try again in ${String(retryInSeconds)} seconds.`,
        { context: { action } },
      );
    }
  }

  /** Forgets the counter for a subject — called after an attempt succeeds legitimately. */
  reset(action: RateLimitAction, key: string): void {
    this.buckets.delete(`${action}:${key}`);
  }

  private prune(now: number): void {
    if (this.buckets.size < MAX_BUCKETS) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
      if (this.buckets.size < MAX_BUCKETS) break;
    }
    // Still full of live buckets (i.e. a flood of distinct keys): drop the oldest.
    while (this.buckets.size >= MAX_BUCKETS) {
      const oldest = this.buckets.keys().next();
      if (oldest.done === true) break;
      this.buckets.delete(oldest.value);
    }
  }
}
