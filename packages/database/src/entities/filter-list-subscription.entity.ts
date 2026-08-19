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
import { checkIn, FILTER_ACTIONS, type FilterAction } from './enums.js';
import { FilterList } from './filter-list.entity.js';

/**
 * An actor's subscription to a published filter list (`INITIAL_VISION.md` §199.2). Composite
 * PK — an actor is subscribed to a list or not, never twice. The subscriber owns `action`; the
 * list author owns the entries — these never swap (§199.2). Evaluated live against the list's
 * current entries; entries are never copied here, so unsubscribing (row delete) is instant and
 * complete (§199.3). **Never creates a `Block`** — the strongest this ever produces is a
 * list-derived mute or filter action (§199.2, restated in `docs/decisions` if it needs one).
 */
@Entity({ name: 'filter_list_subscriptions' })
@Check('chk_filter_list_subscriptions_action', checkIn('action', FILTER_ACTIONS))
export class FilterListSubscription {
  @PrimaryColumn({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  @PrimaryColumn({ type: 'uuid' })
  declare filterListId: string;

  @ManyToOne(() => FilterList, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'filter_list_id' })
  declare filterList: FilterList;

  /** Defaults to `COLLAPSE`, the least destructive useful action (§199.2), enforced
   * service-side — the column itself has no default so a write always states its choice
   * explicitly. */
  @Column({ type: 'text' })
  declare action: FilterAction;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
