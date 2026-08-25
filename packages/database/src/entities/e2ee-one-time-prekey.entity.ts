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
import { E2eeOneTimePrekeyKeyId } from './e2ee-one-time-prekey-key-id.entity.js';

/** Public one-time prekeys. Consumed rows can be swept; the issued-ID ledger is the tombstone. */
@Entity({ name: 'e2ee_one_time_prekeys' })
@Index(['deviceIdentityId', 'keyId'], { unique: true })
@Index(['deviceIdentityId', 'consumedAt', 'id'])
@Index(['consumedAt', 'id'], { where: '"consumed_at" IS NOT NULL' })
// Partial: fast "pop an available one-time prekey for this device" scan. Two columns (not
// three, unlike the general index above) so its name doesn't collide with it.
@Index(['deviceIdentityId', 'id'], { where: '"consumed_at" IS NULL' })
@Check('chk_e2ee_one_time_prekeys_public_key_length', 'octet_length("public_key") = 32')
@Check('chk_e2ee_one_time_prekeys_key_id', '"key_id" > 0')
export class E2eeOneTimePrekey {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare deviceIdentityId: string;

  @ManyToOne(() => E2eeDeviceIdentity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_identity_id' })
  declare deviceIdentity: E2eeDeviceIdentity;

  /** Structural fence: a public prekey exists only for a durably reserved opaque key id. */
  @ManyToOne(() => E2eeOneTimePrekeyKeyId, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'device_identity_id', referencedColumnName: 'deviceIdentityId' },
    { name: 'key_id', referencedColumnName: 'keyId' },
  ])
  declare issuedKeyId: E2eeOneTimePrekeyKeyId;

  @Column({ type: 'bigint' })
  declare keyId: string;

  @Column({ type: 'bytea' })
  declare publicKey: Buffer;

  @CreateDateColumn({ type: 'timestamptz' })
  declare uploadedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare consumedAt: Date | null;

  /** Idempotency/audit link only; intentionally no FK to avoid a prekey/message insert cycle. */
  @Column({ type: 'uuid', nullable: true })
  declare consumedByLogicalMessageId: string | null;
}
