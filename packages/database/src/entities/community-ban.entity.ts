import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Actor } from './actor.entity.js';
import { Community } from './community.entity.js';

/**
 * A community ban (`INITIAL_VISION.md` §189, §192). No uniqueness beyond the surrogate `id` —
 * §189 does not list a unique constraint here, and an actor can accumulate more than one ban
 * record across an appeal/re-ban cycle; "is this actor currently banned" is a service-layer
 * query over the most recent row, not a DB invariant.
 */
@Entity({ name: 'community_bans' })
@Index(['communityId', 'actorId', 'createdAt'])
export class CommunityBan {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare communityId: string;

  @ManyToOne(() => Community, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'community_id' })
  declare community: Community;

  @Column({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  /** Moderator-facing only, never shown to the public (§58-style bound). */
  @Column({ type: 'text', nullable: true })
  declare reason: string | null;

  /** The banning moderator's account may later be deleted without erasing the ban record
   * itself — nullable, `SET NULL` rather than `RESTRICT`. */
  @Column({ type: 'uuid', nullable: true })
  declare bannedByActorId: string | null;

  @ManyToOne(() => Actor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'banned_by_actor_id' })
  declare bannedByActor: Actor | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
