import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import {
  checkIn,
  MODERATION_ACTION_TYPES,
  MODERATION_LOG_SUBJECT_KINDS,
  MODERATION_REASON_CATEGORIES,
  type ModerationActionType,
  type ModerationLogSubjectKind,
  type ModerationReasonCategory,
} from './enums.js';

/**
 * A public, anonymized transparency record of a node-level enforcement action
 * (`INITIAL_VISION.md` §201.4) — never a public record of any individual's conduct. Domain
 * entries are fully identified (`subject_domain` set); account/post/media entries deliberately
 * carry **no actor id, post id, or handle** — the acted-upon actor already has the full,
 * identified version in their own moderation notice (a read projection of `admin_audit_log`,
 * §201.2), and moderators have it in `admin_audit_log` itself. This table has nothing to purge
 * on account deletion (§197.4) because it never held a subject identifier to begin with.
 */
@Entity({ name: 'moderation_log_entries' })
@Index(['createdAt', 'id'])
@Check('chk_moderation_log_entries_action', checkIn('action', MODERATION_ACTION_TYPES))
@Check(
  'chk_moderation_log_entries_subject_kind',
  checkIn('subject_kind', MODERATION_LOG_SUBJECT_KINDS),
)
@Check(
  'chk_moderation_log_entries_reason_category',
  checkIn('reason_category', MODERATION_REASON_CATEGORIES),
)
@Check(
  'chk_moderation_log_entries_subject_domain',
  `("subject_kind" = 'DOMAIN' AND "subject_domain" IS NOT NULL) OR ("subject_kind" <> 'DOMAIN' AND "subject_domain" IS NULL)`,
)
export class ModerationLogEntry {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'text' })
  declare action: ModerationActionType;

  @Column({ type: 'text' })
  declare subjectKind: ModerationLogSubjectKind;

  /** Set only when `subjectKind === 'DOMAIN'` — see the class doc for why every other kind
   * carries no identifier at all. */
  @Column({ type: 'text', nullable: true })
  declare subjectDomain: string | null;

  @Column({ type: 'text' })
  declare reasonCategory: ModerationReasonCategory;

  /** Whether this action was appealed — never the appeal's content (§201.3, §208). */
  @Column({ type: 'boolean', default: false })
  declare appealed: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
