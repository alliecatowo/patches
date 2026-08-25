import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

import { E2eeDeviceIdentity } from './e2ee-device-identity.entity.js';

/**
 * Immutable per-device reservation ledger for opaque one-time-prekey identifiers.
 * Public prekey rows can be swept after consumption; this ledger deliberately remains until
 * the device identity itself is purged so an issued identifier can never be uploaded again.
 */
@Entity({ name: 'e2ee_one_time_prekey_key_ids' })
@Check('chk_e2ee_one_time_prekey_key_ids_key_id', '"key_id" > 0')
export class E2eeOneTimePrekeyKeyId {
  @PrimaryColumn({ type: 'uuid' })
  declare deviceIdentityId: string;

  @ManyToOne(() => E2eeDeviceIdentity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_identity_id' })
  declare deviceIdentity: E2eeDeviceIdentity;

  @PrimaryColumn({ type: 'bigint' })
  declare keyId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  declare issuedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare consumedAt: Date | null;
}
