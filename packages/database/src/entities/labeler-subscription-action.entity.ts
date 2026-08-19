import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Actor } from './actor.entity.js';
import { checkIn, LABEL_ACTIONS, type LabelAction } from './enums.js';
import { Labeler } from './labeler.entity.js';

/**
 * A subscriber's per-value action override for one labeler (`INITIAL_VISION.md` §200.1's
 * "action map"). Composite PK across `(actor_id, labeler_id, value)`: a subscriber sets at
 * most one action per vocabulary value. `value` is free text here (not a `Labeler.vocabulary`
 * foreign key — vocabularies are JSON documents, not rows) but is validated against the
 * labeler's current vocabulary in the service layer at write time. No relation to
 * `labeler_subscriptions` — a subscriber may set an action before or independent of the
 * subscription row's own lifecycle bookkeeping; both are scoped by `(actor_id, labeler_id)`
 * regardless.
 */
@Entity({ name: 'labeler_subscription_actions' })
@Check('chk_labeler_subscription_actions_action', checkIn('action', LABEL_ACTIONS))
export class LabelerSubscriptionAction {
  @PrimaryColumn({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  @PrimaryColumn({ type: 'uuid' })
  declare labelerId: string;

  @ManyToOne(() => Labeler, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labeler_id' })
  declare labeler: Labeler;

  @PrimaryColumn({ type: 'text' })
  declare value: string;

  @Column({ type: 'text' })
  declare action: LabelAction;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
