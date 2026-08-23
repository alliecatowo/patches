import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource } from 'typeorm';

/**
 * The database-backed half of rate limiting (A-018, `INITIAL_VISION.md` §102). Fixed-window
 * counting against `rate_limit_buckets` (`packages/database/src/entities/
 * rate-limit-bucket.entity.ts`), keyed the same way `RateLimitService`'s in-memory buckets
 * are (`<action>:subject:<key>` / `<action>:peer:<key>`) — the two stores never need to agree
 * on anything beyond that string, so `RateLimitService` can consult both without either
 * knowing the other exists.
 *
 * `windowStart` is computed by flooring `now` to a `windowMs` boundary rather than being
 * caller-supplied, so two server processes racing the same action/subject in the same
 * instant always compute the identical `(key, window_start)` primary key and therefore hit
 * the same row.
 */
@Injectable()
export class DbRateLimitStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Atomically increments the counter for `(key, windowStart)` and returns the post-increment
   * count. `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` rather than a
   * read-then-write: two server processes incrementing the same bucket in the same
   * millisecond must never both observe "I was the first" (the same reasoning as
   * `consumeInvite`'s conditional `UPDATE`, applied to an upsert instead of a plain update).
   *
   * Also lazily sweeps rows whose window has fully elapsed, with low enough probability that
   * the extra `DELETE` almost never adds latency to the common path — see the class doc for
   * why a dedicated worker job was not used instead (`docs/architecture/auth.md` §9,
   * `docs/operations/moderation.md`).
   */
  async increment(key: string, windowMs: number, now: Date): Promise<number> {
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const windowEnd = new Date(windowStart.getTime() + windowMs);

    const rows = await this.dataSource.query<Array<{ cost: number }>>(
      `INSERT INTO rate_limit_buckets (key, window_start, cost, window_end)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (key, window_start)
       DO UPDATE SET cost = rate_limit_buckets.cost + 1, updated_at = now()
       RETURNING cost`,
      [key, windowStart, windowEnd],
    );

    // 1-in-50 chance per call: expected to fire often enough in production traffic that
    // expired rows never accumulate unboundedly, rare enough that almost no caller pays for
    // it. Unbounded DELETE is fine here — buckets are windowed and short-lived, so the table
    // never grows large enough for this to be a real table scan in practice.
    if (Math.random() < 0.02) {
      await this.dataSource.query('DELETE FROM rate_limit_buckets WHERE window_end < $1', [now]);
    }

    return rows[0]?.cost ?? 1;
  }
}
