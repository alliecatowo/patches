import { LessThan, type EntityManager, type Repository } from 'typeorm';
import { RateLimitBucket } from '../entities/rate-limit-bucket.entity.js';

/**
 * Repository for `rate_limit_buckets` — atomic increment with TTL cleanup
 * (B-103, `INITIAL_VISION.md` §102).
 *
 * The bucket is identified by `key` + `window_start`. For a given rate limit key
 * (e.g., "register:192.0.2.1"), we find the bucket whose window covers `now`
 * (`window_start <= now < window_end`). If none exists, we create a new one.
 * The increment is atomic via `UPDATE ... SET cost = cost + $1`.
 */
export interface RateLimitBucketRepo {
  /**
   * Atomically increments the bucket's cost by `cost` (default 1).
   * Returns the new cost after increment.
   *
   * If no bucket exists for the current window, creates one with the given
   * `windowStart` and `windowEnd`.
   */
  increment(
    manager: EntityManager,
    key: string,
    windowStart: Date,
    windowEnd: Date,
    cost?: number,
  ): Promise<number>;

  /** Removes all buckets where `window_end < now`. Returns the number of deleted rows. */
  deleteExpired(manager: EntityManager, now?: Date): Promise<number>;
}

/** Default window size for rate limit buckets (1 minute). Can be overridden per call. */
export const DEFAULT_WINDOW_MS = 60_000;

export const rateLimitBucketRepo: RateLimitBucketRepo = {
  async increment(
    manager: EntityManager,
    key: string,
    windowStart: Date,
    windowEnd: Date,
    cost = 1,
  ): Promise<number> {
    const repo: Repository<RateLimitBucket> = manager.getRepository(RateLimitBucket);

    // Try to find an existing bucket for this key and window
    const existing = await repo.findOne({
      where: {
        key,
        windowStart,
      },
    });

    if (existing) {
      // Atomic increment
      const result = await repo
        .createQueryBuilder()
        .update(RateLimitBucket)
        .set({
          cost: () => `"cost" + ${cost}`,
          updatedAt: () => 'NOW()',
        })
        .where('key = :key', { key })
        .andWhere('window_start = :windowStart', { windowStart })
        .execute();

      if ((result.affected ?? 0) === 1) {
        return existing.cost + cost;
      }
      // If the row was deleted concurrently, fall through to create a new one
    }

    // Create a new bucket
    const bucket = repo.create({
      key,
      cost,
      windowStart,
      windowEnd,
    });
    await repo.save(bucket);
    return cost;
  },

  async deleteExpired(manager: EntityManager, now = new Date()): Promise<number> {
    const repo: Repository<RateLimitBucket> = manager.getRepository(RateLimitBucket);
    const result = await repo.delete({ windowEnd: LessThan(now) });
    return result.affected ?? 0;
  },
};

/**
 * Convenience helper to compute window boundaries for a fixed window rate limit.
 * Window is aligned to `windowMs` boundaries (e.g., if windowMs=60000, windows are
 * 00:00:00-00:01:00, 00:01:00-00:02:00, etc.).
 */
export function getWindowBounds(
  now: Date,
  windowMs = DEFAULT_WINDOW_MS,
): {
  windowStart: Date;
  windowEnd: Date;
} {
  const epochMs = now.getTime();
  const windowStartMs = Math.floor(epochMs / windowMs) * windowMs;
  const windowEndMs = windowStartMs + windowMs;
  return {
    windowStart: new Date(windowStartMs),
    windowEnd: new Date(windowEndMs),
  };
}
