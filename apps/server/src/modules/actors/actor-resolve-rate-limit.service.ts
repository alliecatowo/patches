import { Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';

/**
 * Fixed-window, process-local rate limiting for `ResolveActor` (B-028, spec §102) — each call
 * triggers a real outbound WebFinger + actor-document fetch (`RemoteActorService`), so an
 * unbounded caller could use this endpoint to hammer arbitrary remote hosts through this node.
 *
 * A dedicated, minimal copy of `modules/moderation/report-rate-limit.service.ts`'s algorithm
 * (itself a copy of `modules/auth/rate-limit.service.ts`'s — see that file's doc comment for
 * why these stay separate rather than sharing a closed action-name union). Keyed on the
 * caller's own actor id, unlike the report limiter's peer-keyed budget: `ResolveActor`
 * requires an authenticated session (`ActorController`), so an actor-keyed budget is available
 * and is what "rate-limited per actor" (this task's brief) means.
 */
@Injectable()
export class ActorResolveRateLimitService {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  private readonly limit = 20;
  private readonly windowMs = 60 * 60_000;
  private readonly maxBuckets = 5_000;

  consume(actorId: string, now = Date.now()): void {
    const existing = this.buckets.get(actorId);

    if (existing === undefined || existing.resetAt <= now) {
      if (existing === undefined) {
        this.pruneExpired(now);
        if (this.buckets.size >= this.maxBuckets) {
          throw new AppError('RATE_LIMITED', 'Too many actor lookups. Try again later.');
        }
      }
      this.buckets.set(actorId, { count: 1, resetAt: now + this.windowMs });
      return;
    }

    existing.count += 1;
    if (existing.count > this.limit) {
      const retryInSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      throw new AppError(
        'RATE_LIMITED',
        `Too many actor lookups. Try again in ${String(retryInSeconds)} seconds.`,
      );
    }
  }

  private pruneExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
