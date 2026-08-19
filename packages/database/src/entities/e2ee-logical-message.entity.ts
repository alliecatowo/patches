import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity.js';

/**
 * Node-visible metadata common to a logical E2EE fanout. It contains no body, opening, message
 * key, ratchet header plaintext, or ratchet state.
 */
@Entity({ name: 'e2ee_logical_messages' })
@Index(['conversationId', 'acceptedAt', 'id'])
@Index(['senderActorId', 'clientRequestId'], { unique: true })
@Check(
  'chk_e2ee_logical_messages_digest_lengths',
  'octet_length("fanout_digest") = 32 AND octet_length("franking_commitment") = 32',
)
@Check('chk_e2ee_logical_messages_epoch', '"epoch" > 0')
@Check('chk_e2ee_logical_messages_franking_era', '"franking_key_era" > 0')
export class E2eeLogicalMessage {
  /** Client-generated logical id, shared across every per-device envelope. */
  @PrimaryColumn({ type: 'uuid' })
  declare id: string;

  @Column({ type: 'uuid' })
  declare conversationId: string;

  @ManyToOne(() => Conversation, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  declare conversation: Conversation;

  @Column({ type: 'bigint' })
  declare epoch: string;

  /** No FK: accepted moderation evidence keeps this opaque actor id after account deletion. */
  @Column({ type: 'uuid' })
  declare senderActorId: string;

  @Column({ type: 'uuid' })
  declare senderDeviceId: string;

  @Column({ type: 'uuid' })
  declare clientRequestId: string;

  @Column({ type: 'bytea' })
  declare fanoutDigest: Buffer;

  @Column({ type: 'bytea' })
  declare frankingCommitment: Buffer;

  @Column({ type: 'text' })
  declare frankingProfile: string;

  @Column({ type: 'integer' })
  declare frankingKeyEra: number;

  @Column({ type: 'bytea' })
  declare frankingTag: Buffer;

  @CreateDateColumn({ type: 'timestamptz' })
  declare acceptedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare deletedAt: Date | null;
}
