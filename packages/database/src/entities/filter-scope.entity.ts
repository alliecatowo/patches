import { Check, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { checkIn, FILTER_SCOPES, type FilterScope as FilterScopeValue } from './enums.js';
import { Filter } from './filter.entity.js';

/**
 * Where a filter applies (`INITIAL_VISION.md` §198.3). Composite PK, same shape as
 * `Like`/`Bookmark` — a filter either applies to a scope or it doesn't, never twice.
 */
@Entity({ name: 'filter_scopes' })
@Check('chk_filter_scopes_scope', checkIn('scope', FILTER_SCOPES))
export class FilterScope {
  @PrimaryColumn({ type: 'uuid' })
  declare filterId: string;

  @ManyToOne(() => Filter, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'filter_id' })
  declare filter: Filter;

  @PrimaryColumn({ type: 'text' })
  declare scope: FilterScopeValue;
}
