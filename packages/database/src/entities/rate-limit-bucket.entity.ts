import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * The db-backed half of rate limiting (A-018, `INITIAL_VISION.md` §102). `RateLimitService`
 * (`apps/server`) stays process-local for cheap per-RPC throttles; this table exists so the
 * flows spec §102 calls out by name — register/login/password-reset/verify/challenge-issuance
 * — are enforced across every server process and survive a restart, not just within one.
 *
 * Fixed-window counting, one row per `(key, window_start)`: `key` already encodes the action
 * and the subject (e.g. `login:subject:alice@example.com`), so the table has no separate
 * `action` column. A worker sweep (`apps/worker`) deletes rows once `expires_at` has passed —
 * this table is not itself TTL'd by Postgres.
 */
@Entity({ name: 'rate_limit_buckets' })
export class RateLimitBucket {
  @PrimaryColumn({ type: 'text' })
  declare key: string;

  /** The fixed window this row's `count` belongs to — part of the primary key alongside
   * `key`, so a new window is a new row rather than a read-modify-write on stale data. */
  @PrimaryColumn({ type: 'timestamptz' })
  declare windowStart: Date;

  @Column({ type: 'int', default: 0 })
  declare count: number;

  /** `window_start + windowMs`, stored redundantly so the sweep needs no per-action window
   * table to compute it from. */
  @Column({ type: 'timestamptz' })
  declare expiresAt: Date;
}
