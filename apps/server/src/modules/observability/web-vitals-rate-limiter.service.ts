import { Injectable } from '@nestjs/common';

/** Above this many live buckets, a brand-new peer is refused rather than admitted — same
 * unbounded-memory guard `federation/security/peer-rate-limiter.service.ts` uses for the
 * same reason (an unauthenticated endpoint's caller set is unbounded). */
const MAX_BUCKETS = 5_000;
const WINDOW_MS = 60_000;
/** One flush per `pagehide`/hidden-`visibilitychange` per tab — generous enough for several
 * tabs/rapid navigations from one peer, still bounded well below anything a legitimate
 * browser could produce. */
const LIMIT_PER_WINDOW = 60;

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Process-local throttle for the unauthenticated Web Vitals ingest endpoint (B-182), mirroring
 * `PeerRateLimiterService`'s in-memory fixed-window approach (spec §102 allows coarse
 * process-local throttles with no Redis in v0) — kept as its own small class, rather than
 * reused from the federation module, so this module has no dependency on federation-specific
 * code for an unrelated feature.
 */
@Injectable()
export class WebVitalsRateLimiterService {
  private readonly buckets = new Map<string, Bucket>();

  /** `true` if `peer` is within budget (and consumes one unit); `false` for `429`. */
  consume(peer: string, now: Date = new Date()): boolean {
    const nowMs = now.getTime();
    const existing = this.buckets.get(peer);
    if (existing === undefined || existing.resetAt <= nowMs) {
      if (existing === undefined && this.buckets.size >= MAX_BUCKETS) {
        for (const [key, bucket] of this.buckets) {
          if (bucket.resetAt <= nowMs) this.buckets.delete(key);
        }
        if (this.buckets.size >= MAX_BUCKETS) return false;
      }
      this.buckets.set(peer, { count: 1, resetAt: nowMs + WINDOW_MS });
      return true;
    }
    if (existing.count >= LIMIT_PER_WINDOW) return false;
    existing.count += 1;
    return true;
  }
}
