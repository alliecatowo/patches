import { Injectable } from '@nestjs/common';

/** Above this many live buckets, a brand-new peer is refused rather than admitted — same
 * unbounded-memory guard `auth/rate-limit.service.ts` uses. */
const MAX_BUCKETS = 5_000;
const WINDOW_MS = 60_000;
const LIMIT_PER_WINDOW = 120;

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Process-local inbox throttles (P8-006: "rate limit remote inboxes"; spec §102 explicitly
 * allows coarse process-local throttles with no Redis in v0). The transport budget is keyed
 * by the socket peer before any attacker-controlled JSON is parsed or fetched. The origin
 * budget is separate and is only keyed after the actor and signature have been verified.
 */
@Injectable()
export class PeerRateLimiterService {
  private readonly transportBuckets = new Map<string, Bucket>();
  private readonly originBuckets = new Map<string, Bucket>();

  consumeTransportPeer(peer: string, now: Date = new Date()): boolean {
    return consume(this.transportBuckets, peer, now);
  }

  consumeVerifiedOrigin(origin: string, now: Date = new Date()): boolean {
    return consume(this.originBuckets, origin, now);
  }
}

/** `true` if this key is within budget (and consumes one unit); `false` for `429`. */
function consume(buckets: Map<string, Bucket>, key: string, now: Date): boolean {
  const nowMs = now.getTime();
  const existing = buckets.get(key);
  if (existing === undefined || existing.resetAt <= nowMs) {
    if (existing === undefined && buckets.size >= MAX_BUCKETS) {
      // Capacity is a bound on *live* buckets, not historical peers. Reclaim expired entries
      // before refusing a new peer so a one-time spray cannot permanently deny admission after
      // its windows have elapsed.
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= nowMs) buckets.delete(bucketKey);
      }
      if (buckets.size >= MAX_BUCKETS) return false;
    }
    buckets.set(key, { count: 1, resetAt: nowMs + WINDOW_MS });
    return true;
  }
  if (existing.count >= LIMIT_PER_WINDOW) return false;
  existing.count += 1;
  return true;
}
