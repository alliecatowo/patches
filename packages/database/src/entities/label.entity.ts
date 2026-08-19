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
import { checkIn, LABEL_SUBJECT_TYPES, type LabelSubjectType } from './enums.js';
import { Labeler } from './labeler.entity.js';
import { Post } from './post.entity.js';

/**
 * A label applied by a labeler to a post or actor (`INITIAL_VISION.md` §200.1). Exactly one
 * subject column is set, matching `subject_type` — the same shape `Report` uses (`CHECK`
 * mirrors `report.entity.ts`'s `chk_reports_subject_matches_type`, two-column subset).
 * Retraction is explicit (`retracted_at`) and preserves history rather than deleting the row
 * (§200.1). Visible only to viewers subscribed to `labeler_id` — enforced entirely in the
 * service layer, not here; this table has no visibility predicate of its own.
 */
@Entity({ name: 'labels' })
@Index(['labelerId', 'subjectActorId'])
@Index(['labelerId', 'subjectPostId'])
@Check('chk_labels_subject_type', checkIn('subject_type', LABEL_SUBJECT_TYPES))
@Check(
  'chk_labels_subject_matches_type',
  `("subject_type" = 'ACTOR' AND "subject_actor_id" IS NOT NULL AND "subject_post_id" IS NULL)
   OR ("subject_type" = 'POST' AND "subject_post_id" IS NOT NULL AND "subject_actor_id" IS NULL)`,
)
export class Label {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare labelerId: string;

  @ManyToOne(() => Labeler, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labeler_id' })
  declare labeler: Labeler;

  @Column({ type: 'text' })
  declare subjectType: LabelSubjectType;

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

  /** Must be one of `labelers.vocabulary`'s current values — enforced service-side, never a
   * free-text column-level constraint here (§200.2, §208's ban on free-form label values). */
  @Column({ type: 'text' })
  declare value: string;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  /** Null means this label never expires. */
  @Column({ type: 'timestamptz', nullable: true })
  declare expiresAt: Date | null;

  /** Null means not retracted. */
  @Column({ type: 'timestamptz', nullable: true })
  declare retractedAt: Date | null;
}
