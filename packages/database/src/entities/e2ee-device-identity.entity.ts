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
import { E2eeIdentityRoot } from './e2ee-identity-root.entity.js';

/** Root-certified public device identity. No device private material is node-persisted. */
@Entity({ name: 'e2ee_device_identities' })
@Index(['actorId', 'deviceId', 'generation'], { unique: true })
@Index(['actorId', 'revokedAt'])
// Partial: at most one *active* (non-revoked) generation per (actor, device).
@Index(['actorId', 'deviceId'], { unique: true, where: '"revoked_at" IS NULL' })
@Check(
  'chk_e2ee_device_identities_key_lengths',
  'octet_length("signing_public_key") = 32 AND octet_length("agreement_public_key") = 32',
)
@Check('chk_e2ee_device_identities_signature_length', 'octet_length("root_signature") = 64')
@Check('chk_e2ee_device_identities_generation', '"generation" > 0')
@Check('chk_e2ee_device_identities_validity', '"expires_at" > "certificate_created_at"')
export class E2eeDeviceIdentity {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  @Column({ type: 'uuid' })
  declare identityRootId: string;

  @ManyToOne(() => E2eeIdentityRoot, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'identity_root_id' })
  declare identityRoot: E2eeIdentityRoot;

  @Column({ type: 'uuid' })
  declare deviceId: string;

  @Column({ type: 'integer' })
  declare generation: number;

  @Column({ type: 'bytea' })
  declare signingPublicKey: Buffer;

  @Column({ type: 'bytea' })
  declare agreementPublicKey: Buffer;

  @Column({ type: 'bytea' })
  declare certificateBytes: Buffer;

  @Column({ type: 'bytea' })
  declare rootSignature: Buffer;

  @Column({ type: 'timestamptz' })
  declare certificateCreatedAt: Date;

  @Column({ type: 'timestamptz' })
  declare expiresAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  declare registeredAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare revokedAt: Date | null;
}
