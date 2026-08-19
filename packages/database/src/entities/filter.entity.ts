import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Actor } from './actor.entity.js';
import { checkIn, FILTER_ACTIONS, type FilterAction } from './enums.js';

/**
 * A viewer-owned filter (`INITIAL_VISION.md` §198.1) — subtractive only, never adds, reorders,
 * or scores anything (§198.1, §208). `name` and `filter_terms.value` (see `filter-term.entity`)
 * are sensitive at the application layer (§202): never logged, never shown to a moderator,
 * included in the §197.3 account export, and deleted with the account (§197.4) or the filter
 * itself.
 */
@Entity({ name: 'filters' })
@Index(['actorId'])
@Check('chk_filters_action', checkIn('action', FILTER_ACTIONS))
export class Filter {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  /** Shown when a post is collapsed by this filter. Sensitive — see class doc. */
  @Column({ type: 'text' })
  declare name: string;

  @Column({ type: 'text' })
  declare action: FilterAction;

  /** Null means the filter never expires. */
  @Column({ type: 'timestamptz', nullable: true })
  declare expiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  declare updatedAt: Date;
}
