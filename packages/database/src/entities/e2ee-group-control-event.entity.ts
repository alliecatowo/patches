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
import { Conversation } from './conversation.entity.js';
import { checkIn, E2EE_GROUP_CHANGE_KINDS, type E2eeGroupChangeKind } from './enums.js';

/**
 * One authenticated membership transition of an `E2EE_V1` conversation (ADR 0020 §7,
 * P13-008): the signed/monotonic group-control transcript whose length *is* the membership
 * epoch. Every payload binds the epoch it was composed under, and the fanout recomputes its
 * expected device set from the membership this transcript describes — so a removed member's
 * devices can never be addressed by a later send, and a message composed under a stale
 * epoch is rejected whole rather than delivered.
 *
 * The row mirrors `e2ee_device_rosters`' split: `event_bytes`/`device_signature`/`digest`
 * are the authoritative stored bytes; the decoded convenience fields on the wire message
 * are re-derived from `event_bytes` on read (`decodeGroupControlTranscript` in
 * `apps/server`), never trusted from a client.
 */
@Entity({ name: 'e2ee_group_control_events' })
@Index(['conversationId', 'epoch'], { unique: true })
@Check('chk_e2ee_group_control_events_epoch', '"epoch" >= 2')
@Check(
  'chk_e2ee_group_control_events_digest_lengths',
  'octet_length("previous_digest") = 32 AND octet_length("digest") = 32',
)
@Check('chk_e2ee_group_control_events_change', checkIn('change_kind', E2EE_GROUP_CHANGE_KINDS))
export class E2eeGroupControlEvent {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare conversationId: string;

  @ManyToOne(() => Conversation, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  declare conversation: Conversation;

  /** Epoch 1 is the creation membership and is never an event row — see the CHECK above. */
  @Column({ type: 'bigint' })
  declare epoch: string;

  @Column({ type: 'text' })
  declare changeKind: E2eeGroupChangeKind;

  /** No FK, same reasoning as `E2eeLogicalMessage.senderActorId`: the transcript keeps this
   * actor id after account deletion — "who was in the group when" is evidence, not a live
   * relation. */
  @Column({ type: 'uuid' })
  declare subjectActorId: string;

  @Column({ type: 'uuid' })
  declare signerActorId: string;

  @Column({ type: 'uuid' })
  declare signerDeviceId: string;

  /** All-zero 32 bytes on the first event (epoch 2); chains by digest thereafter. */
  @Column({ type: 'bytea' })
  declare previousDigest: Buffer;

  @Column({ type: 'bytea' })
  declare digest: Buffer;

  @Column({ type: 'bytea' })
  declare eventBytes: Buffer;

  /** Ed25519 by the signer device's signing key, strict RFC 8032 semantics. */
  @Column({ type: 'bytea' })
  declare deviceSignature: Buffer;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
