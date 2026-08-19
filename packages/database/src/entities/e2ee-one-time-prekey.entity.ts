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

/** Public one-time prekeys. Consumed rows remain as anti-replay tombstones. */
@Entity({ name: 'e2ee_one_time_prekeys' })
@Index(['deviceIdentityId', 'keyId'], { unique: true })
@Index(['deviceIdentityId', 'consumedAt', 'id'])
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
