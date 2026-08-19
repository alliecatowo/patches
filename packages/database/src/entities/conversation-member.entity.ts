import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Actor } from './actor.entity.js';
import { Conversation } from './conversation.entity.js';

/**
 * A conversation membership (`INITIAL_VISION.md` §189). Composite PK — an actor is either in
 * a conversation or not. `leftAt` (not a row delete) preserves the actor's read history and
 * lets `LeaveConversation` stay idempotent without losing `lastReadMessageId`.
 */
@Entity({ name: 'conversation_members' })
export class ConversationMember {
  @PrimaryColumn({ type: 'uuid' })
  declare conversationId: string;

  @ManyToOne(() => Conversation, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  declare conversation: Conversation;

  @PrimaryColumn({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  @CreateDateColumn({ type: 'timestamptz' })
  declare joinedAt: Date;

  /** Null while still a member. */
  @Column({ type: 'timestamptz', nullable: true })
  declare leftAt: Date | null;

  /** Null if nothing has been read yet. No FK to `messages` on purpose: a message can be
   * deleted (tombstoned, not removed) after being marked read, and this column must keep
   * pointing at its id regardless. */
  @Column({ type: 'uuid', nullable: true })
  declare lastReadMessageId: string | null;

  @Column({ type: 'boolean', default: false })
  declare muted: boolean;
}
