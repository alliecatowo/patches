import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Actor } from './actor.entity.js';
import { FilterListEntry } from './filter-list-entry.entity.js';
import { FilterList } from './filter-list.entity.js';

/**
 * A subscriber's per-entry exception (`INITIAL_VISION.md` §199.3) — "this list is right about
 * everything except my friend," without unsubscribing and without telling the list author.
 * Composite PK across all three: an exception is scoped to one subscriber's one subscription's
 * one entry. `filterListId` is denormalized alongside `filterListEntryId` (rather than derived
 * via a join every time) because it is part of the natural key the spec gives (§202) and lets
 * a lookup filter by list without joining through the entry table.
 */
@Entity({ name: 'filter_list_exceptions' })
export class FilterListException {
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

  @PrimaryColumn({ type: 'uuid' })
  declare filterListEntryId: string;

  @ManyToOne(() => FilterListEntry, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'filter_list_entry_id' })
  declare filterListEntry: FilterListEntry;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
