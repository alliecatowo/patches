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
import { Conversation } from './conversation.entity.js';

/**
 * A direct message (`INITIAL_VISION.md` §183.4, §189, §192). Bodies never appear in
 * logs/metrics/traces/errors — enforced at the logging layer, not here. Soft delete
 * (tombstone), same as `Post` — `body` is cleared and `deletedAt` set, never a hard delete.
 */
@Entity({ name: 'messages' })
@Index(['conversationId', 'createdAt', 'id'])
@Index(['senderActorId', 'clientRequestId'], { unique: true })
export class Message {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare conversationId: string;

  @ManyToOne(() => Conversation, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  declare conversation: Conversation;

  /** Nullable, `SET NULL` rather than `RESTRICT`/`CASCADE`: the sender's account may later be
   * deleted (tombstoned) without erasing the rest of the conversation's history for its other
   * members. */
  @Column({ type: 'uuid', nullable: true })
  declare senderActorId: string | null;

  @ManyToOne(() => Actor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sender_actor_id' })
  declare senderActor: Actor | null;

  /** Max 2,000 characters (§188). Empty once tombstoned. */
  @Column({ type: 'text' })
  declare body: string;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare deletedAt: Date | null;

  /** Client-generated idempotency key (§45) — `SendMessage`'s, or `CreateConversation`'s for a
   * conversation's first message. `null` only for rows a future writer creates without one;
   * every message `DirectMessageService` writes sets it. Same pattern as
   * `Post.clientRequestId`. */
  @Column({ type: 'uuid', nullable: true })
  declare clientRequestId: string | null;
}
