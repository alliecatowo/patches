import { Injectable } from '@nestjs/common';

/** Above this many live buckets, a brand-new domain is refused rather than admitted — same
 * unbounded-memory guard `auth/rate-limit.service.ts` uses. */
const MAX_BUCKETS = 5_000;
const WINDOW_MS = 60_000;
const LIMIT_PER_WINDOW = 120;

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Process-local, per-peer-domain inbox throttle (P8-006: "rate limit remote inboxes"; spec
 * §102 explicitly allows coarse process-local throttles with no Redis in v0). One counter per
 * sending domain, not per activity or per actor — a single hostile/misbehaving instance is
 * exactly what this bounds, regardless of how many distinct actors it sends as.
 */
@Injectable()
export class PeerRateLimiterService {
  private readonly buckets = new Map<string, Bucket>();

  /** `true` if this request from `domain` is within budget (and is recorded as consuming
   * one unit of it); `false` if the domain should be rejected (`429`). */
  consume(domain: string, now: Date = new Date()): boolean {
    const nowMs = now.getTime();
    const existing = this.buckets.get(domain);
    if (existing === undefined || existing.resetAt <= nowMs) {
      if (existing === undefined && this.buckets.size >= MAX_BUCKETS) return false;
      this.buckets.set(domain, { count: 1, resetAt: nowMs + WINDOW_MS });
      return true;
    }
    if (existing.count >= LIMIT_PER_WINDOW) return false;
    existing.count += 1;
    return true;
  }
}
