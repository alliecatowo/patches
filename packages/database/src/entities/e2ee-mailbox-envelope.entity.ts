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
import { E2eeDeviceIdentity } from './e2ee-device-identity.entity.js';
import { E2eeLogicalMessage } from './e2ee-logical-message.entity.js';

/** One opaque pairwise envelope in a recipient device mailbox. */
@Entity({ name: 'e2ee_mailbox_envelopes' })
@Index(['logicalMessageId', 'recipientDeviceIdentityId'], { unique: true })
// Partial, not general: the only mailbox-fetch query path is "undelivered envelopes for this
// device, oldest first" (§7/§9) — acknowledged envelopes are cleaned up, not browsed by this
// shape. A non-partial twin over the same three columns would collide on name (see the other
// e2ee-*.entity.ts partial-index comments), so there is deliberately only one index here.
@Index(['recipientDeviceIdentityId', 'receivedAt', 'id'], {
  where: '"acknowledged_at" IS NULL AND "deleted_at" IS NULL',
})
@Check('chk_e2ee_mailbox_envelopes_digest_length', 'octet_length("ciphertext_digest") = 32')
@Check(
  'chk_e2ee_mailbox_envelopes_size',
  'octet_length("encrypted_header") + octet_length("ciphertext") + octet_length("opening_ciphertext") <= 65536',
)
export class E2eeMailboxEnvelope {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare logicalMessageId: string;

  @ManyToOne(() => E2eeLogicalMessage, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'logical_message_id' })
  declare logicalMessage: E2eeLogicalMessage;

  @Column({ type: 'uuid' })
  declare recipientDeviceIdentityId: string;

  @ManyToOne(() => E2eeDeviceIdentity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipient_device_identity_id' })
  declare recipientDeviceIdentity: E2eeDeviceIdentity;

  @Column({ type: 'bytea' })
  declare encryptedHeader: Buffer;

  @Column({ type: 'bytea' })
  declare ciphertext: Buffer;

  /** Franking opening encrypted inside the pairwise device payload. */
  @Column({ type: 'bytea' })
  declare openingCiphertext: Buffer;

  @Column({ type: 'bytea' })
  declare ciphertextDigest: Buffer;

  @CreateDateColumn({ type: 'timestamptz' })
  declare receivedAt: Date;

  /** Set only after the client durably commits its receive ratchet transition. */
  @Column({ type: 'timestamptz', nullable: true })
  declare acknowledgedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  declare deletedAt: Date | null;
}
