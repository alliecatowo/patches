import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Actor } from './actor.entity.js';
import { checkIn, ACCOUNT_EXPORT_STATUSES, type AccountExportStatus } from './enums.js';

/**
 * A background account-data export job's status/artifact (`INITIAL_VISION.md` §197.3). Only
 * one `READY` archive is kept at a time, expiring after 7 days (§204) — enforced by the export
 * job replacing the previous ready row, not by a database constraint (a `PENDING`/`FAILED` row
 * from a prior request and a fresh `PENDING` retry can coexist briefly by request id, so a
 * blanket uniqueness constraint on `actor_id` would be wrong).
 *
 * `objectKey` is the private R2 object key; the presigned `download_url` the API returns is
 * derived from it at read time (spec §29, ADR 0005) and is never itself persisted.
 */
@Entity({ name: 'account_exports' })
@Index(['actorId', 'requestedAt'])
@Check('chk_account_exports_status', checkIn('status', ACCOUNT_EXPORT_STATUSES))
export class AccountExport {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  @Column({ type: 'text', default: 'PENDING' })
  declare status: AccountExportStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  declare requestedAt: Date;

  /** Null until `READY`. */
  @Column({ type: 'timestamptz', nullable: true })
  declare readyAt: Date | null;

  /** Null until `READY`. The R2 object key — never returned to a client directly; the RPC
   * layer converts this to a short-lived pre-signed URL. */
  @Column({ type: 'text', nullable: true })
  declare objectKey: string | null;

  /** Null until `READY`; the archive's deletion deadline once it is. */
  @Column({ type: 'timestamptz', nullable: true })
  declare expiresAt: Date | null;
}
