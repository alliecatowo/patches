import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { checkIn, OUTBOX_JOB_STATUSES, type OutboxJobStatus } from './enums.js';

/**
 * The durable job queue and transactional outbox (`INITIAL_VISION.md` §12–13,
 * `docs/architecture/jobs.md`). PostgreSQL is the only queue — no Redis/BullMQ/Kafka in v0
 * (§12, §153).
 *
 * Rows are written in the **same transaction** as the mutation that requires the follow-up
 * work, which is what makes "database write committed but the queue publish was lost"
 * impossible. Workers claim rows with `FOR UPDATE SKIP LOCKED` — see
 * `src/repositories/outbox.ts` for the claim/complete/fail helpers.
 */
@Entity({ name: 'outbox_jobs' })
// §60: supports `WHERE status = 'PENDING' AND available_at <= now() ORDER BY id`.
@Index(['status', 'availableAt', 'id'])
@Index(['idempotencyKey'], { unique: true })
@Check('chk_outbox_jobs_status', checkIn('status', OUTBOX_JOB_STATUSES))
@Check('chk_outbox_jobs_attempts', `"attempts" >= 0 AND "max_attempts" >= 1`)
export class OutboxJob {
  /**
   * `bigint` rather than uuid: this is an internal queue record, never a public identifier
   * (§18), and a monotonic id gives the claim query a natural FIFO order. The `pg` driver
   * returns int8 as a **string** — see `docs/research/typeorm-postgres.md` §7.
   */
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  declare id: string;

  /** Job type, e.g. `SEND_VERIFICATION_EMAIL` (`docs/architecture/jobs.md` §6). */
  @Column({ type: 'text' })
  declare type: string;

  @Column({ type: 'jsonb' })
  declare payload: Record<string, unknown>;

  @Column({ type: 'text', default: 'PENDING' })
  declare status: OutboxJobStatus;

  @Column({ type: 'int', default: 0 })
  declare attempts: number;

  @Column({ type: 'int', default: 10 })
  declare maxAttempts: number;

  /** Claimable only once `now() >= available_at`; also how exponential backoff is expressed. */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  declare availableAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare lockedAt: Date | null;

  /** Worker instance identifier — for operator visibility, not for correctness. */
  @Column({ type: 'text', nullable: true })
  declare lockedBy: string | null;

  @Column({ type: 'text', nullable: true })
  declare lastError: string | null;

  /**
   * Optional producer-side dedup key ("send the verification email for user X once"). Unique
   * where present; PostgreSQL treats NULLs as distinct, so jobs without a key never collide.
   */
  @Column({ type: 'text', nullable: true })
  declare idempotencyKey: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare completedAt: Date | null;
}
