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
import { FilterList } from './filter-list.entity.js';

/**
 * One entry of a published filter list (`INITIAL_VISION.md` §199.1) — the same five kinds a
 * personal `FilterTerm` uses (`enums.ts`'s `FILTER_TERM_KINDS`). Up to 2,000 per list (§204,
 * enforced service-side).
 */
@Entity({ name: 'filter_list_entries' })
@Index(['filterListId'])
@Check('chk_filter_list_entries_kind', checkIn('kind', FILTER_TERM_KINDS))
export class FilterListEntry {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare filterListId: string;

  @ManyToOne(() => FilterList, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'filter_list_id' })
  declare filterList: FilterList;

  @Column({ type: 'text' })
  declare kind: FilterTermKind;

  @Column({ type: 'text' })
  declare value: string;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
