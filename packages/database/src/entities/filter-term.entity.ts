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
import { checkIn, FILTER_TERM_KINDS, type FilterTermKind } from './enums.js';
import { Filter } from './filter.entity.js';

/**
 * One match term of a filter (`INITIAL_VISION.md` §198.2) — a literal `(kind, value)` pair,
 * never a user-supplied pattern (§208's regex prohibition). `value` is sensitive at the
 * application layer — see `filter.entity.ts`'s class doc.
 */
@Entity({ name: 'filter_terms' })
@Index(['filterId'])
@Check('chk_filter_terms_kind', checkIn('kind', FILTER_TERM_KINDS))
export class FilterTerm {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare filterId: string;

  @ManyToOne(() => Filter, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'filter_id' })
  declare filter: Filter;

  @Column({ type: 'text' })
  declare kind: FilterTermKind;

  /** A literal value the server matches against — never a user-supplied pattern. Sensitive —
   * see `filter.entity.ts`'s class doc. */
  @Column({ type: 'text' })
  declare value: string;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
