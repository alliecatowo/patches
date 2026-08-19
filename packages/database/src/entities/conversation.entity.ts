import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Actor } from './actor.entity.js';
import { checkIn, CONVERSATION_KINDS, type ConversationKind } from './enums.js';

/**
 * A direct-message conversation (`INITIAL_VISION.md` §183.4, §189). Never federated, no
 * media, no link previews (§192).
 */
@Entity({ name: 'conversations' })
@Check('chk_conversations_kind', checkIn('kind', CONVERSATION_KINDS))
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'text', default: 'DIRECT' })
  declare kind: ConversationKind;

  /** Nullable, `SET NULL` rather than `RESTRICT`: a conversation must outlive its creator's
   * account (its other members' history must not disappear) — same reasoning as
   * `CommunityBan.bannedByActorId`. */
  @Column({ type: 'uuid', nullable: true })
  declare createdByActorId: string | null;

  @ManyToOne(() => Actor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_actor_id' })
  declare createdByActor: Actor | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  /** Denormalized for `ListConversations`'s ordering (most-recently-active first) — updated
   * by `DirectMessageService` on every `SendMessage`. */
  @Column({ type: 'timestamptz' })
  declare lastMessageAt: Date;
}
