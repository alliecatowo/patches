import { Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';

/**
 * Fixed-window, process-local rate limiting for `ReportPost`/`ReportActor` (spec §102).
 *
 * A dedicated, minimal copy of `modules/auth/rate-limit.service.ts`'s algorithm rather than a
 * dependency on that service directly: `RateLimitService`'s `RateLimitAction` union
 * (`login`/`register`/...) is closed and lives in `apps/server/src/modules/auth/**`, which is
 * out of this task's file scope — adding a `'report'` member there is a one-line change for
 * whichever task next touches `auth/rate-limit.service.ts` (flagged in this task's report).
 * Keyed on the caller's network peer (`getRequestContext()?.peer`) rather than actor id: an
 * actor-keyed budget alone would not stop a single blocked-out attacker from spinning up many
 * accounts to keep reporting the same target.
 */
@Injectable()
export class ReportRateLimitService {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  private readonly limit = 10;
  private readonly windowMs = 60 * 60_000;
  private readonly maxBuckets = 5_000;

  consume(peer: string | undefined, now = Date.now()): void {
    const key = peer ?? 'unknown';
    const existing = this.buckets.get(key);

    if (existing === undefined || existing.resetAt <= now) {
      if (existing === undefined) {
        this.pruneExpired(now);
        if (this.buckets.size >= this.maxBuckets) {
          throw new AppError('RATE_LIMITED', 'Too many reports. Try again later.');
        }
      }
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }

    existing.count += 1;
    if (existing.count > this.limit) {
      const retryInSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      throw new AppError(
        'RATE_LIMITED',
        `Too many reports. Try again in ${String(retryInSeconds)} seconds.`,
      );
    }
  }

  private pruneExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
