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
import { Community } from './community.entity.js';
import { Conversation } from './conversation.entity.js';
import { checkIn, NOTIFICATION_TYPES, type NotificationType } from './enums.js';
import { Post } from './post.entity.js';

/**
 * A notification row (`INITIAL_VISION.md` §56, §113). No separate event service — a row is the
 * event. `recipient_actor_id` (not `user_id`, unlike the spec's conceptual sketch) matches the
 * rest of this schema's actor-centric shape (every other social table is keyed on actor, not
 * user — §21's "actor is the social identity" split).
 *
 * Deduplication (§113: "a user should not receive 74 identical notifications because a worker
 * retried") is enforced at two layers: `NotificationsService` checks-then-inserts inside its
 * transaction, and these three partial unique indexes are the database backstop for a
 * concurrent race — split three ways because a plain unique index cannot dedupe `NULL` rows
 * (PostgreSQL treats `NULL <> NULL`, so a single `(recipient, type, actor, post)` index would
 * never catch two identical `FOLLOW` notifications, which always have `post_id = NULL`). The
 * `conversation_id` index (P11-004, §183.4) collapses repeat `MESSAGE` notifications from the
 * same sender in the same conversation into one unread row, same reasoning as `LIKE`/`REPLY`
 * collapsing per post — and the `post_id IS NULL` index is narrowed to also require
 * `conversation_id IS NULL` so it keeps meaning "FOLLOW/MODERATION", not "any MESSAGE too".
 */
@Entity({ name: 'notifications' })
@Index(['recipientActorId', 'createdAt', 'id'])
@Index(['recipientActorId', 'readAt'])
@Index(['recipientActorId', 'type', 'actorId', 'postId'], {
  unique: true,
  where: '"post_id" IS NOT NULL',
})
@Index(['recipientActorId', 'type', 'conversationId'], {
  unique: true,
  where: '"conversation_id" IS NOT NULL AND "read_at" IS NULL',
})
@Index(['recipientActorId', 'type', 'actorId'], {
  unique: true,
  where:
    '"post_id" IS NULL AND "conversation_id" IS NULL AND "community_id" IS NULL AND "type" <> \'MESSAGE\'',
})
@Check('chk_notifications_type', checkIn('type', NOTIFICATION_TYPES))
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare recipientActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipient_actor_id' })
  declare recipientActor: Actor;

  @Column({ type: 'text' })
  declare type: NotificationType;

  /** The actor who triggered this notification (who liked/followed/replied/mentioned). Null
   * for a MODERATION notification with no attributable actor. */
  @Column({ type: 'uuid', nullable: true })
  declare actorId: string | null;

  @ManyToOne(() => Actor, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor | null;

  /** Set for LIKE/REPLY/MENTION; null for FOLLOW/MODERATION/MESSAGE. */
  @Column({ type: 'uuid', nullable: true })
  declare postId: string | null;

  @ManyToOne(() => Post, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  declare post: Post | null;

  /** Set for MESSAGE (P11-004, §183.4); null otherwise. Never resolves to a message body —
   * the client calls `DirectMessageService.ListMessages` for that (spec §192, §194). */
  @Column({ type: 'uuid', nullable: true })
  declare conversationId: string | null;

  @ManyToOne(() => Conversation, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  declare conversation: Conversation | null;

  /** Set for COMMUNITY_INVITE (P11-003, spec §187); null otherwise. */
  @Column({ type: 'uuid', nullable: true })
  declare communityId: string | null;

  @ManyToOne(() => Community, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'community_id' })
  declare community: Community | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare readAt: Date | null;
}
