import { Injectable } from '@nestjs/common';
import { RATE_LIMITS } from '@patches/domain';

import { AppError } from '../../common/errors/app-error.js';
import { DbRateLimitStore } from './db-rate-limit-store.service.js';

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
  | 'ssh_complete'
  /** `BeginMediaUpload` (spec §102): each call gets a presigned PUT and a `media` row,
   * so an unbounded caller could mint unlimited pending uploads/rows without ever
   * finishing one. */
  | 'media_begin_upload'
  /** `BeginGitHubLogin` (P6-005, spec §176): each call is an outbound HTTP request to GitHub
   * and a new device-flow attempt held in memory — both worth bounding per caller. */
  | 'github_begin_login'
  /** `PollGitHubLogin`: `AuthService` also honors GitHub's own `interval`/`slow_down` per
   * device code, but this bounds the *number of distinct device codes* one peer can poll. */
  | 'github_poll_login'
  /** `PrivacyService.ExportAccount` (P14-010, spec §204: `exportRequestedPerDay`) — bounds how
   * many background export jobs one actor can enqueue. */
  | 'export_account'
  /** `PrivacyService.RequestAccountDeletion`/`CancelAccountDeletion` share one budget (spec
   * §204: `accountDeletionRequestedOrCancelledPerDay`) — either call, in any combination,
   * spends from it. */
  | 'account_deletion_request_or_cancel';

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
  media_begin_upload: { limit: 30, windowMs: 5 * 60_000 },
  github_begin_login: { limit: 20, windowMs: 5 * 60_000 },
  github_poll_login: { limit: 120, windowMs: 5 * 60_000 },
  // Daily windows, straight from `packages/domain`'s §204 table — the single source of truth
  // every layer (proto docs, this limiter, the future database constraint) reads from, same
  // rule the `filters`/`labels` rate limits already follow.
  export_account: { limit: RATE_LIMITS.exportRequestedPerDay, windowMs: 24 * 60 * 60_000 },
  account_deletion_request_or_cancel: {
    limit: RATE_LIMITS.accountDeletionRequestedOrCancelledPerDay,
    windowMs: 24 * 60 * 60_000,
  },
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
  github_begin_login: { limit: 40, windowMs: 5 * 60_000 },
  github_poll_login: { limit: 240, windowMs: 5 * 60_000 },
});

/** Above this many live buckets, a brand-new key is refused rather than admitted. */
const MAX_BUCKETS = 20_000;

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * The subset of {@link RateLimitAction}s spec §102 names explicitly ("login, password reset,
 * registration, verification resend") plus challenge issuance (tasks.md P1-008/A-018) —
 * these get a *second*, database-backed check via {@link RateLimitService.consumeDistributed}
 * on top of the in-memory one below, so their budget is enforced across every server process
 * and survives a restart. Every other action (media upload, GitHub polling) stays
 * process-local only: coarse throttles §102 explicitly allows to stay that way.
 */
export const DB_BACKED_RATE_LIMIT_ACTIONS: ReadonlySet<RateLimitAction> = new Set([
  'register',
  'login',
  'password_reset',
  'verify_email',
  'resend_verification',
  'ssh_challenge',
  // 24-hour windows especially cannot be process-local only: a single server restart (or a
  // second process) must not silently double an actor's daily export/deletion budget.
  'export_account',
  'account_deletion_request_or_cancel',
]);

/**
 * Fixed-window rate limiting, **process-local** (spec §102 explicitly allows coarse
 * process-local throttles; there is no Redis in v0, §153).
 *
 * This is a v0 stopgap for most actions, not the end state: with more than one server
 * process the effective limit is multiplied by the process count, and a restart forgets
 * every counter. §102 wants the sensitive flows backed by the database before MVP — done via
 * {@link consumeDistributed}/{@link DbRateLimitStore} (A-018), called *in addition to* the
 * in-memory `consume()` below at each of `DB_BACKED_RATE_LIMIT_ACTIONS`' call sites in
 * `auth.service.ts`, never instead of it: the in-memory check is what stops a single runaway
 * process from ever reaching the database, the database check is what stops the limit being
 * divided by the process count.
 */
@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly dbStore: DbRateLimitStore) {}

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

  /**
   * A-018: the cross-process, restart-surviving companion to {@link consume} — call it with
   * the *same* `action`/`key` right alongside `consume()`, never instead of it, for every
   * action in {@link DB_BACKED_RATE_LIMIT_ACTIONS}. Uses the same `WINDOWS` budget as the
   * in-memory check, so the two never disagree about what "too many" means, only about
   * whether "too many" is scoped to this process or to the whole fleet.
   */
  async consumeDistributed(action: RateLimitAction, key: string, now = new Date()): Promise<void> {
    const window = WINDOWS[action];
    const count = await this.dbStore.increment(`${action}:subject:${key}`, window.windowMs, now);
    if (count > window.limit) {
      const retryInSeconds = Math.ceil(window.windowMs / 1000);
      throw new AppError(
        'RATE_LIMITED',
        `Too many attempts. Try again in ${String(retryInSeconds)} seconds.`,
        { context: { action } },
      );
    }
  }

  /**
   * The peer-keyed sibling of {@link consumeDistributed}, for actions (`ssh_challenge`) that
   * only ever get a peer-scoped in-memory budget via {@link consumePeer} — there is no
   * meaningful "subject" to key on before a credential exists to challenge.
   */
  async consumeDistributedPeer(
    action: RateLimitAction,
    peer: string | undefined,
    now = new Date(),
  ): Promise<void> {
    const window = PEER_WINDOWS[action];
    if (window === undefined) return;
    const count = await this.dbStore.increment(
      `${action}:peer:${peer ?? 'unknown'}`,
      window.windowMs,
      now,
    );
    if (count > window.limit) {
      const retryInSeconds = Math.ceil(window.windowMs / 1000);
      throw new AppError(
        'RATE_LIMITED',
        `Too many attempts. Try again in ${String(retryInSeconds)} seconds.`,
        { context: { action } },
      );
    }
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
