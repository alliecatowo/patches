import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { E2eeDeviceIdentity } from './e2ee-device-identity.entity.js';

/** Public signed prekeys; old rows remain until their delayed-message grace window expires. */
@Entity({ name: 'e2ee_signed_prekeys' })
@Index(['deviceIdentityId', 'keyId'], { unique: true })
@Index(['deviceIdentityId', 'expiresAt'])
@Index(['retiredAt', 'id'], { where: '"retired_at" IS NOT NULL' })
// Partial: at most one *active* (non-retired) signed prekey per device.
@Index(['deviceIdentityId'], { unique: true, where: '"retired_at" IS NULL' })
@Check('chk_e2ee_signed_prekeys_public_key_length', 'octet_length("public_key") = 32')
@Check('chk_e2ee_signed_prekeys_signature_length', 'octet_length("signature") = 64')
@Check('chk_e2ee_signed_prekeys_key_id', '"key_id" > 0')
@Check('chk_e2ee_signed_prekeys_validity', '"expires_at" > "created_at"')
export class E2eeSignedPrekey {
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

  @Column({ type: 'bytea' })
  declare signature: Buffer;

  @Column({ type: 'timestamptz' })
  declare createdAt: Date;

  @Column({ type: 'timestamptz' })
  declare expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare retiredAt: Date | null;
}
