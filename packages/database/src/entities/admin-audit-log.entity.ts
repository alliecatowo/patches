import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { checkIn, ADMIN_AUDIT_SUBJECT_TYPES, type AdminAuditSubjectType } from './enums.js';

/**
 * The admin CLI's audit trail (`INITIAL_VISION.md` §66). Every mutating `patches-admin`
 * command writes exactly one row here, in the same transaction as the mutation it performs —
 * "the CLI did something to the database but nobody can see it happened" is the failure mode
 * this table exists to make impossible.
 *
 * No relation to `users`/`actors` here: `admin_user_id` is intentionally a bare column, not a
 * `@ManyToOne`. An operator account can be suspended or deleted without that ever cascading
 * into (or being blocked by) its own audit history — the log outlives the account it recorded.
 *
 * `metadata` never carries a password, access token, refresh token, or reset code (§66) — the
 * admin CLI is responsible for keeping that true at every call site that writes a row here.
 */
@Entity({ name: 'admin_audit_log' })
@Index(['createdAt'])
@Index(['subjectType', 'subjectId'])
@Check('chk_admin_audit_log_subject_type', checkIn('subject_type', ADMIN_AUDIT_SUBJECT_TYPES))
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  /** The operating admin's `users.id`. Not a foreign key — see the class doc. */
  @Column({ type: 'uuid' })
  declare adminUserId: string;

  /** e.g. `invite.create`, `user.suspend`, `report.resolve`, `job.replay`. Free text: the set
   * of admin commands is expected to grow, and a CHECK constraint here would need editing on
   * every new command. */
  @Column({ type: 'text' })
  declare action: string;

  @Column({ type: 'text' })
  declare subjectType: AdminAuditSubjectType;

  /** The id of whatever `subjectType` names — a user, invite, report, post or job id. Text,
   * not uuid: `outbox_jobs.id` is a bigint-as-string (see `OutboxJob`). */
  @Column({ type: 'text' })
  declare subjectId: string;

  /** Structured detail (a reason string, a resolve action, before/after counts). Never a
   * secret — see the class doc. */
  @Column({ type: 'jsonb', nullable: true })
  declare metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
