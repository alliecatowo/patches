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
 * Per-*subject* budgets — deliberately conservative: these guard credential-guessing and
 * email-sending, not throughput. `key` is whatever the caller is trying to authenticate as
 * (a normalized handle/email, a user id). For `register`, `ssh_challenge` and `ssh_complete`
 * that subject is chosen by the caller (a handle, a claimed SSH fingerprint, a challenge id
 * that is single-use by construction) and therefore **cannot**, on its own, bound a caller
 * that varies it every attempt — see {@link PEER_WINDOWS}, which every action below is also
 * checked against wherever the peer address is known.
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

/**
 * Coarser per-*peer* ceilings for the actions where the subject budget above is otherwise
 * meaningless because the subject is caller-chosen (spec §102 review finding: `register`,
 * `beginSshLogin` and `completeSshLogin` were previously keyed only on attacker-supplied
 * values — a fresh handle/fingerprint/challenge id every attempt never re-hits the same
 * bucket). A peer address can be many legitimate callers behind one NAT/proxy, so its budget
 * is generously higher than any single subject's; it exists to bound a raw flood, not to
 * replace the subject budget where the subject is trustworthy (`login`, `password_reset`
 * also get a peer budget, in addition to their existing subject one, for defense in depth).
 */
const PEER_WINDOWS: Readonly<Partial<Record<RateLimitAction, Window>>> = Object.freeze({
  register: { limit: 40, windowMs: 60 * 60_000 },
  login: { limit: 60, windowMs: 5 * 60_000 },
  password_reset: { limit: 30, windowMs: 60 * 60_000 },
  ssh_challenge: { limit: 60, windowMs: 5 * 60_000 },
  ssh_complete: { limit: 60, windowMs: 5 * 60_000 },
});

/** Above this many live buckets, a brand-new key is refused rather than admitted. */
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
 */
@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  /**
   * Records one attempt against a subject and throws `RATE_LIMITED` (→ `RESOURCE_EXHAUSTED`)
   * once the window's budget is spent. `key` is never logged as-is by this service.
   */
  consume(action: RateLimitAction, key: string, now = Date.now()): void {
    this.consumeBucket(action, `${action}:subject:${key}`, WINDOWS[action], now);
  }

  /**
   * The peer-scoped companion to {@link consume}: call it whenever the caller's network peer
   * is known (`getRequestContext()?.peer`), in addition to — never instead of — the subject
   * budget. A no-op for actions with no configured peer window. `peer` is `undefined` when
   * grpc-js could not resolve one; that still gets its own shared bucket rather than bypassing
   * the check entirely.
   */
  consumePeer(action: RateLimitAction, peer: string | undefined, now = Date.now()): void {
    const window = PEER_WINDOWS[action];
    if (window === undefined) return;
    this.consumeBucket(action, `${action}:peer:${peer ?? 'unknown'}`, window, now);
  }

  /** Forgets the counter for a subject — called after an attempt succeeds legitimately. */
  reset(action: RateLimitAction, key: string): void {
    this.buckets.delete(`${action}:subject:${key}`);
  }

  private consumeBucket(
    action: RateLimitAction,
    mapKey: string,
    window: Window,
    now: number,
  ): void {
    const existing = this.buckets.get(mapKey);

    if (existing === undefined || existing.resetAt <= now) {
      if (existing === undefined) {
        this.pruneExpired(now);
        if (this.buckets.size >= MAX_BUCKETS) {
          // Capacity is full of buckets that have not yet expired. Refusing the new key
          // outright — rather than evicting one of the live ones to make room — is what stops
          // an attacker from resetting a real target's counter by flooding in enough distinct
          // junk keys to force an eviction (a live bucket is never a stale one just because it
          // is the oldest by insertion order).
          throw new AppError('RATE_LIMITED', 'Too many attempts. Try again later.', {
            context: { action },
          });
        }
      }
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

  /** Deletes every bucket whose window has already elapsed. Never touches a live one. */
  private pruneExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
