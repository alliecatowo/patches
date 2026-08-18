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
import { Actor } from './actor.entity.js';
import { checkIn, FOLLOW_STATUSES, type FollowStatus } from './enums.js';

/**
 * A follow edge (`INITIAL_VISION.md` §50, §61). Only `PENDING`/`FOLLOWING` rows ever exist —
 * `NONE` (spec §50's third state) is represented by the *absence* of a row, never a row with
 * that status, so `UnfollowActor` is a delete, not an update. `PENDING` is unreachable in v0
 * (every v0 local-account follow transitions straight to `FOLLOWING`) but the column exists
 * now so a later approval-gated follow flow is an application change, not a migration.
 */
@Entity({ name: 'follows' })
@Index(['followerActorId', 'followeeActorId'], { unique: true })
// §60's required indexes, both directions: `ListFollowing` pages the caller's own following
// list (keyed by `followerActorId`); `ListFollowers` pages who follows a given actor (keyed by
// `followeeActorId`). Both page by the canonical `(created_at DESC, id DESC)` keyset (§46).
@Index(['followerActorId', 'createdAt', 'id'])
@Index(['followeeActorId', 'createdAt', 'id'])
@Check('chk_follows_status', checkIn('status', FOLLOW_STATUSES))
@Check('chk_follows_no_self_follow', `"follower_actor_id" <> "followee_actor_id"`)
export class Follow {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare followerActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'follower_actor_id' })
  declare followerActor: Actor;

  @Column({ type: 'uuid' })
  declare followeeActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'followee_actor_id' })
  declare followeeActor: Actor;

  @Column({ type: 'text', default: 'FOLLOWING' })
  declare status: FollowStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  /** Set when `status` becomes `FOLLOWING`; null while `PENDING` (unreachable in v0). */
  @Column({ type: 'timestamptz', nullable: true })
  declare acceptedAt: Date | null;
}
