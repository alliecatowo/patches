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
import { AdminAuditLog } from './admin-audit-log.entity.js';
import { checkIn, APPEAL_STATUSES, type AppealStatus } from './enums.js';
import { User } from './user.entity.js';

/**
 * An appeal against a node moderation notice (`INITIAL_VISION.md` §201.3). Only the
 * acted-upon actor may appeal — enforced in the service layer by scoping every read/write to
 * the caller's own `actor_id`, not by anything in this schema. `admin_audit_log_id` is unique:
 * one appeal per enforcement action (§201.3) — a resolved appeal does not reopen, a *new*
 * action may be appealed independently. Admin-side resolution is CLI-only
 * (`patches-admin appeal list|inspect|resolve`, mirroring `report list|inspect|resolve`) —
 * there is deliberately no gRPC resolve RPC (`appeals.proto`).
 */
@Entity({ name: 'appeals' })
@Index(['adminAuditLogId'], { unique: true })
@Check('chk_appeals_status', checkIn('status', APPEAL_STATUSES))
export class Appeal {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  /** The `admin_audit_log` row this appeal contests — the moderation notice is a read
   * projection of that row (§201.2), not a second source of truth, so the appeal points at
   * the same row directly rather than at a separate notice table. */
  @Column({ type: 'uuid' })
  declare adminAuditLogId: string;

  @ManyToOne(() => AdminAuditLog, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'admin_audit_log_id' })
  declare adminAuditLog: AdminAuditLog;

  /** Max 2,000 characters (spec §204). */
  @Column({ type: 'text' })
  declare statement: string;

  @Column({ type: 'text', default: 'OPEN' })
  declare status: AppealStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare resolvedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  declare resolvedByUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolved_by_user_id' })
  declare resolvedByUser: User | null;

  /** Authored by the resolving moderator at resolution time — same shape `reports` uses for
   * `moderator_note` applied here to appeal outcomes instead (§201.3). Null until resolved. */
  @Column({ type: 'text', nullable: true })
  declare resolutionReason: string | null;
}
