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

/**
 * A topical community a post may optionally belong to (`INITIAL_VISION.md` §189, §190). A
 * community moderator's authority stops at the community boundary (§192).
 */
@Entity({ name: 'communities' })
@Index(['name'], { unique: true })
@Check('chk_communities_name', `"name" ~ '^[a-z0-9_]{3,32}$'`)
export class Community {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  /** `[a-z0-9_]`, 3-32 characters, unique per node (§188). */
  @Column({ type: 'text' })
  declare name: string;

  /** Max 80 characters (§188). */
  @Column({ type: 'text' })
  declare displayName: string;

  /** Max 500 characters (§188). */
  @Column({ type: 'text', default: '' })
  declare description: string;

  /** Max 4 KiB (§188). */
  @Column({ type: 'text', default: '' })
  declare rules: string;

  @Column({ type: 'uuid' })
  declare createdByActorId: string;

  /** The community's founder never disappears from under it — deleting the account that
   * created a community must not cascade-delete the community itself. */
  @ManyToOne(() => Actor, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_actor_id' })
  declare createdByActor: Actor;

  @Column({ type: 'boolean', default: true })
  declare isPublic: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  declare updatedAt: Date;
}
