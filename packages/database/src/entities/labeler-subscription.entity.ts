import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Actor } from './actor.entity.js';
import { Labeler } from './labeler.entity.js';

/**
 * An actor's subscription to a labeler (`INITIAL_VISION.md` §200.1, §200.3). Composite PK,
 * same shape as `Like`/`Bookmark`. A label is visible to a viewer only through this row
 * existing — labeling someone with no subscribers has no effect on anyone (§200.3).
 */
@Entity({ name: 'labeler_subscriptions' })
export class LabelerSubscription {
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

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
