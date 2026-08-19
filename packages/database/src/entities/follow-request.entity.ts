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

/**
 * A pending follow request against a locked actor (`INITIAL_VISION.md` §197.5, P14-010's
 * follow-up). Kept as its own table rather than reusing `follows.status = 'PENDING'`: that
 * status already means something different — a v0 local `FollowActor` never produces it, but
 * a follow of a **remote** actor does, while its `Follow` row waits for that actor's own node
 * to send back an `Accept` activity (`follow.entity.ts`, P8-002/P8-003). Conflating "awaiting
 * a locked local actor's human approval" with "awaiting a remote server's federation handshake"
 * in one row/column would make `InboxService`'s accept-on-`Accept` handler and this table's
 * accept-on-approval handler race the same row for two unrelated reasons. A follow request
 * never becomes a `Follow` row until accepted — `GraphService.acceptFollowRequest` creates the
 * `Follow` row and deletes this one in the same transaction.
 *
 * Only one row per (requester, target) pair can ever be pending — enforced by the unique index
 * below, same technique `MessageRequest`'s partial unique index uses. Unlocking an account does
 * **not** auto-accept any request already pending against it (spec §197.5's explicit "never
 * auto-accepted"); rows here are unaffected by `actor_privacy_prefs.locked` flipping either way
 * — only `AcceptFollowRequest`/`RejectFollowRequest`/`UnfollowActor` (as cancel) ever remove one.
 */
@Entity({ name: 'follow_requests' })
@Index(['requesterActorId', 'targetActorId'], { unique: true })
// Pages `ListFollowRequests` (the target's own inbound queue) on the canonical
// `(created_at DESC, id DESC)` keyset (§46) — mirrors `follow.entity.ts`'s
// `followeeActorId`-keyed index for the same reason.
@Index(['targetActorId', 'createdAt', 'id'])
export class FollowRequest {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  /** The actor who asked to follow `targetActorId`. */
  @Column({ type: 'uuid' })
  declare requesterActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_actor_id' })
  declare requesterActor: Actor;

  /** The locked actor whose approval this request awaits. */
  @Column({ type: 'uuid' })
  declare targetActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_actor_id' })
  declare targetActor: Actor;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
