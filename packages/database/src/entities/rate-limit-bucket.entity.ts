import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Rate limit bucket for DB-backed global rate limiting (B-103, `INITIAL_VISION.md` §102).
 * Keyed by a string identifier (e.g., "register:192.0.2.1", "login:user@example.com"),
 * tracks cost within a time window defined by `window_start`/`window_end`.
 *
 * The composite of `key` + `window_start` uniquely identifies a bucket. A single key can
 * have multiple buckets over time as windows expire. The TTL cleanup job removes buckets
 * where `window_end < NOW()`.
 */
@Entity({ name: 'rate_limit_buckets' })
@Index(['windowEnd'])
export class RateLimitBucket {
  @PrimaryColumn({ type: 'text' })
  declare key: string;

  @Column({ type: 'int', default: 0 })
  declare cost: number;

  @CreateDateColumn({ type: 'timestamptz' })
  declare windowStart: Date;

  @Column({ type: 'timestamptz' })
  declare windowEnd: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  declare updatedAt: Date;
}
