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
import {
  checkIn,
  CONVERSATION_KINDS,
  CONVERSATION_SECURITY_MODES,
  type ConversationKind,
  type ConversationSecurityMode,
} from './enums.js';

/**
 * A direct-message conversation (`INITIAL_VISION.md` §183.4, §189). Never federated, no
 * media, no link previews (§192).
 */
@Entity({ name: 'conversations' })
@Check('chk_conversations_kind', checkIn('kind', CONVERSATION_KINDS))
@Check('chk_conversations_security_mode', checkIn('security_mode', CONVERSATION_SECURITY_MODES))
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'text', default: 'DIRECT' })
  declare kind: ConversationKind;

  /** Immutable after insert. A database trigger in the Phase 13 migration rejects changes.
   * `E2EE_V1` is the only value since ADR 0030 §B-095 removed `LEGACY_SERVER_VISIBLE`. */
  @Column({ type: 'text', default: 'E2EE_V1' })
  declare securityMode: ConversationSecurityMode;

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

  /** `E2EE_V1` only (ADR 0020 §7, ADR 0026, P13-008); always `'1'` for `LEGACY_SERVER_VISIBLE`.
   * Denormalized from `E2eeConversationMembershipEvent`'s newest row so a fanout accept can lock
   * and read it with one row lock on `conversations` rather than a separate lock on the event
   * table — see `e2ee-fanout.ts`'s and `e2ee-membership.ts`'s module doc comments for the race
   * this row lock resolves. PostgreSQL bigint is returned as a string by pg. */
  @Column({ type: 'bigint', default: '1' })
  declare membershipEpoch: string;
}
