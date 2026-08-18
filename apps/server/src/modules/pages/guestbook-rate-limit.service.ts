import { Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window, process-local rate limiting for `SignGuestbook` (spec §102, §172 —
 * "guestbooks are spam magnets; treat entry creation as hostile input").
 *
 * Unlike `ModerationService`'s `ReportRateLimitService` (peer-only — reporting is close to
 * anonymous, and an attacker can mint accounts freely), `SignGuestbook` always has an
 * authenticated actor behind it, so this keys on *both* the caller's network peer and their
 * actor id, independently: a script rotating accounts from one machine is still capped by
 * peer, and a script rotating peers under one already-registered account is still capped by
 * actor. Either bucket tripping rejects the call.
 *
 * A dedicated, minimal copy of `modules/auth/rate-limit.service.ts`'s fixed-window algorithm
 * — same reasoning as `ReportRateLimitService`'s doc comment for why it isn't shared: that
 * service's `RateLimitAction` union is closed and lives outside this task's file scope.
 */
@Injectable()
export class GuestbookRateLimitService {
  private readonly peerBuckets = new Map<string, Bucket>();
  private readonly actorBuckets = new Map<string, Bucket>();

  private readonly peerLimit = 20;
  private readonly actorLimit = 5;
  private readonly windowMs = 10 * 60_000;
  private readonly maxBuckets = 5_000;

  consume(peer: string | undefined, actorId: string, now = Date.now()): void {
    this.consumeBucket(this.peerBuckets, peer ?? 'unknown', this.peerLimit, now);
    this.consumeBucket(this.actorBuckets, actorId, this.actorLimit, now);
  }

  private consumeBucket(
    buckets: Map<string, Bucket>,
    key: string,
    limit: number,
    now: number,
  ): void {
    const existing = buckets.get(key);

    if (existing === undefined || existing.resetAt <= now) {
      if (existing === undefined) {
        this.pruneExpired(buckets, now);
        if (buckets.size >= this.maxBuckets) {
          throw new AppError('RATE_LIMITED', 'Too many guestbook signatures. Try again later.');
        }
      }
      buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }

    existing.count += 1;
    if (existing.count > limit) {
      const retryInSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      throw new AppError(
        'RATE_LIMITED',
        `Too many guestbook signatures. Try again in ${String(retryInSeconds)} seconds.`,
      );
    }
  }

  private pruneExpired(buckets: Map<string, Bucket>, now: number): void {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }
}
