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
import { Conversation } from './conversation.entity.js';
import { checkIn } from './enums.js';

export const E2EE_MEMBERSHIP_ACTIONS = ['GENESIS', 'ADD', 'REMOVE'] as const;
export type E2eeMembershipAction = (typeof E2EE_MEMBERSHIP_ACTIONS)[number];

/**
 * A conversation's membership epoch chain (ADR 0020 §7, ADR 0026, P13-008): one row per
 * membership change, mirroring `E2eeDeviceRoster`'s digest-chain shape. Epoch 1 (`GENESIS`) is
 * unsigned and system-authored at `CreateE2eeConversation` time; `root_signature`/
 * `root_generation` are `NULL` only for that row. `member_actor_ids` is a persisted convenience
 * column (the resulting active roster after this link) so a fanout/query never needs to decode
 * `event_bytes` to know current membership — the same "persist the decoded columns a query
 * needs" convention `E2eeDeviceIdentity` uses for its certificate fields.
 */
@Entity({ name: 'e2ee_conversation_membership_events' })
@Index(['conversationId', 'epoch'], { unique: true })
@Index(['digest'], { unique: true })
@Check('chk_e2ee_membership_events_action', checkIn('action', E2EE_MEMBERSHIP_ACTIONS))
@Check('chk_e2ee_membership_events_epoch', '"epoch" > 0')
@Check(
  'chk_e2ee_membership_events_digest_lengths',
  'octet_length("previous_digest") = 32 AND octet_length("digest") = 32',
)
@Check(
  'chk_e2ee_membership_events_signature',
  '("action" = \'GENESIS\' AND "root_signature" IS NULL AND "root_generation" IS NULL AND "target_actor_id" IS NULL)' +
    ' OR ("action" != \'GENESIS\' AND octet_length("root_signature") = 64 AND "root_generation" IS NOT NULL AND "target_actor_id" IS NOT NULL)',
)
export class E2eeConversationMembershipEvent {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare conversationId: string;

  @ManyToOne(() => Conversation, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  declare conversation: Conversation;

  /** PostgreSQL bigint is returned as a string by pg. Starts at 1 (`GENESIS`). */
  @Column({ type: 'bigint' })
  declare epoch: string;

  @Column({ type: 'bytea' })
  declare previousDigest: Buffer;

  @Column({ type: 'bytea' })
  declare digest: Buffer;

  /** The exact canonical bytes `root_signature` covers. Empty for `GENESIS`. */
  @Column({ type: 'bytea' })
  declare eventBytes: Buffer;

  @Column({ type: 'text' })
  declare action: E2eeMembershipAction;

  /** The member who authored this link; the conversation's creator for `GENESIS`. */
  @Column({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  /** Null only for `GENESIS`. No FK: a removed actor's id must remain visible in the chain. */
  @Column({ type: 'uuid', nullable: true })
  declare targetActorId: string | null;

  @Column({ type: 'text', array: true })
  declare memberActorIds: string[];

  /** Null only for `GENESIS`. */
  @Column({ type: 'integer', nullable: true })
  declare rootGeneration: number | null;

  /** Null only for `GENESIS`. */
  @Column({ type: 'bytea', nullable: true })
  declare rootSignature: Buffer | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
