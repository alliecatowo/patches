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
import {
  checkIn,
  FILTER_ACTIONS,
  FILTER_SCOPES,
  type FilterAction,
  type FilterScope,
} from './enums.js';
import { FilterList } from './filter-list.entity.js';

/** The full `FILTER_SCOPES` set, as a Postgres `ARRAY[...]` literal — the subscription-table
 * `scopes` column's DEFAULT (P14-022, spec §199.1's subscriber-chosen scopes, "empty defaults
 * to every scope"). Kept next to the column it defaults so the two never drift independently. */
const ALL_FILTER_SCOPES_ARRAY_LITERAL = `ARRAY[${FILTER_SCOPES.map((scope) => `'${scope}'`).join(', ')}]::text[]`;

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

  /** Which of the subscriber's own viewing contexts this list's entries apply to (spec §199.1
   * "an action and scopes the subscriber chooses", P14-022) — the subscription-side half of
   * the "intersection" `feeds/filter-matching.ts#loadEffectiveFilterRules` performs against a
   * request's own scope. Defaults to every scope at the DB level so a pre-P14-022 row (and any
   * write that genuinely means "every scope") never silently narrows. */
  @Column({ type: 'text', array: true, default: () => ALL_FILTER_SCOPES_ARRAY_LITERAL })
  declare scopes: FilterScope[];

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
