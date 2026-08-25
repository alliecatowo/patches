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

/** The full `FILTER_SCOPES` set, as a Postgres array-literal string — the subscription-table
 * `scopes` column's DEFAULT (P14-022, spec §199.1's subscriber-chosen scopes, "empty defaults
 * to every scope"). Kept next to the column it defaults so the two never drift independently.
 *
 * B-077: deliberately a quoted `'{A,B,...}'` literal, **not** an `ARRAY['A', 'B', ...]` call
 * expression and **not** cast with `::text[]`. TypeORM 1.x's postgres driver compares a
 * function-valued `default` against the live column two ways that both trip on the `ARRAY[...]`
 * form: (1) it introspects the live default by stripping every `::cast` suffix
 * (`PostgresQueryRunner.loadTables`), so a literal ending in `::text[]` never matches what it
 * reads back once that cast is stripped; (2) it lowercases everything *outside* single-quoted
 * spans before comparing (`PostgresDriver.lowerDefaultValueIfNecessary`, meant for function
 * calls like `NOW()`), which silently turns `ARRAY[` into `array[` on the entity side while
 * Postgres always reports the keyword back as `ARRAY[` — an unfixable case mismatch as long as
 * `ARRAY` sits outside the quotes. A bare quoted `'{...}'` literal has no keyword outside its
 * quotes and needs no cast (Postgres infers `text[]` from the column), so it is stable under
 * both transformations and `migration:generate` reports no drift once applied. */
const ALL_FILTER_SCOPES_ARRAY_LITERAL = `'{${FILTER_SCOPES.join(',')}}'`;

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
