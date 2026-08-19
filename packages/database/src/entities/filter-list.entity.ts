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
import { Community } from './community.entity.js';

/**
 * A published, subscribable filter list (`INITIAL_VISION.md` §199.1) — the decentralized
 * primitive. Data only: no code, no action, no scope, no ordering, no scores. Owned by
 * exactly one of an actor or a community (`CHECK`, mirrors `Report`'s exactly-one-subject
 * pattern) — a community's list is maintained by its moderators but has no authority over
 * non-members and none inside the community either (§199.1). NULLs are distinct in a
 * PostgreSQL unique index, so the two plain composite indexes below are sufficient to
 * enforce "unique name per owner" without a partial `WHERE` clause: every community-owned
 * row shares `owner_actor_id = NULL`, which never collides with another NULL.
 */
@Entity({ name: 'filter_lists' })
@Index(['ownerActorId', 'name'], { unique: true })
@Index(['ownerCommunityId', 'name'], { unique: true })
@Check(
  'chk_filter_lists_one_owner',
  `("owner_actor_id" IS NOT NULL AND "owner_community_id" IS NULL) OR ("owner_actor_id" IS NULL AND "owner_community_id" IS NOT NULL)`,
)
export class FilterList {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid', nullable: true })
  declare ownerActorId: string | null;

  @ManyToOne(() => Actor, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_actor_id' })
  declare ownerActor: Actor | null;

  @Column({ type: 'uuid', nullable: true })
  declare ownerCommunityId: string | null;

  @ManyToOne(() => Community, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_community_id' })
  declare ownerCommunity: Community | null;

  @Column({ type: 'text' })
  declare name: string;

  @Column({ type: 'text' })
  declare displayName: string;

  @Column({ type: 'text', default: '' })
  declare description: string;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  declare updatedAt: Date;
}
