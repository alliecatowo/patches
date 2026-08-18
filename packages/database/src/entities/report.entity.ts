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
import {
  checkIn,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_SUBJECT_TYPES,
  type ReportReason,
  type ReportStatus,
  type ReportSubjectType,
} from './enums.js';
import { GuestbookEntry } from './guestbook-entry.entity.js';
import { Post } from './post.entity.js';
import { User } from './user.entity.js';

/**
 * A user report (`INITIAL_VISION.md` §64) — the exact shape the spec's `reports` table
 * sketches, field for field. "Do not delete reported content automatically merely because it
 * was reported": nothing in this entity or `ModerationService` ever touches `posts`/`actors`
 * as a side effect of a report existing.
 *
 * `moderator_note`/`resolved_at`/`resolved_by_user_id` are written by the admin CLI (spec §65),
 * not by anything in this task's scope — `ModerationService.ReportPost`/`ReportActor` only
 * ever insert an `OPEN` row. No user-facing RPC reads `moderator_note` back (§55).
 *
 * `subject_guestbook_entry_id` (P45-003) is the third subject column, added alongside
 * `GUESTBOOK_ENTRY` in `REPORT_SUBJECT_TYPES` — `PageService.ReportGuestbookEntry` writes
 * here rather than `ModerationService` growing a guestbook-entry RPC of its own.
 */
@Entity({ name: 'reports' })
@Index(['status', 'createdAt'])
@Index(['subjectActorId'])
@Index(['subjectPostId'])
@Index(['subjectGuestbookEntryId'])
@Check('chk_reports_subject_type', checkIn('subject_type', REPORT_SUBJECT_TYPES))
@Check('chk_reports_reason', checkIn('reason', REPORT_REASONS))
@Check('chk_reports_status', checkIn('status', REPORT_STATUSES))
// Exactly one of the three subject columns is set, matching `subject_type`.
@Check(
  'chk_reports_subject_matches_type',
  `("subject_type" = 'ACTOR' AND "subject_actor_id" IS NOT NULL AND "subject_post_id" IS NULL AND "subject_guestbook_entry_id" IS NULL)
   OR ("subject_type" = 'POST' AND "subject_post_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_guestbook_entry_id" IS NULL)
   OR ("subject_type" = 'GUESTBOOK_ENTRY' AND "subject_guestbook_entry_id" IS NOT NULL AND "subject_actor_id" IS NULL AND "subject_post_id" IS NULL)`,
)
export class Report {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare reporterActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_actor_id' })
  declare reporterActor: Actor;

  @Column({ type: 'text' })
  declare subjectType: ReportSubjectType;

  @Column({ type: 'uuid', nullable: true })
  declare subjectActorId: string | null;

  @ManyToOne(() => Actor, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subject_actor_id' })
  declare subjectActor: Actor | null;

  @Column({ type: 'uuid', nullable: true })
  declare subjectPostId: string | null;

  @ManyToOne(() => Post, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subject_post_id' })
  declare subjectPost: Post | null;

  @Column({ type: 'uuid', nullable: true })
  declare subjectGuestbookEntryId: string | null;

  @ManyToOne(() => GuestbookEntry, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subject_guestbook_entry_id' })
  declare subjectGuestbookEntry: GuestbookEntry | null;

  @Column({ type: 'text' })
  declare reason: ReportReason;

  /** Free text, max 2,000 characters (enforced service-side). */
  @Column({ type: 'text', nullable: true })
  declare details: string | null;

  @Column({ type: 'text', default: 'OPEN' })
  declare status: ReportStatus;

  /** Internal only — never returned by a user-facing RPC (spec §55). Written by the admin CLI. */
  @Column({ type: 'text', nullable: true })
  declare moderatorNote: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare resolvedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  declare resolvedByUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolved_by_user_id' })
  declare resolvedByUser: User | null;
}
