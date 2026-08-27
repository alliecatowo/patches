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

/**
 * A short-lived offer relayed by `BeginDeviceLink` (ADR 0037 §1): the new device's public
 * material, held for at most 10 minutes until the authority device signs it via `EnrollDevice`
 * or it expires. Never a device — it never appears in a roster, fanout, or prekey inventory
 * (§3.4). `offerBytes`/`deviceSignature` are the only authoritative content; the node stores the
 * remaining columns purely to relay them back through `ListPendingDeviceLinks` without decoding
 * or trusting them on the authority's behalf.
 */
@Entity({ name: 'e2ee_device_link_offers' })
@Index(['actorId', 'expiresAt'])
@Index(['actorId', 'deviceId'], { unique: true })
@Check(
  'chk_e2ee_device_link_offers_device_signature_length',
  'octet_length("device_signature") = 64',
)
@Check(
  'chk_e2ee_device_link_offers_prekey_bundle_signature_length',
  'octet_length("prekey_bundle_signature") = 64',
)
@Check('chk_e2ee_device_link_offers_signed_prekey_key_id', '"signed_prekey_key_id" > 0')
@Check(
  'chk_e2ee_device_link_offers_signed_prekey_validity',
  '"signed_prekey_expires_at" > "signed_prekey_created_at"',
)
@Check('chk_e2ee_device_link_offers_validity', '"expires_at" > "created_at"')
export class E2eeDeviceLinkOffer {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  @Column({ type: 'text' })
  declare deviceId: string;

  /** The canonical `E2eeDeviceLinkOffer` transcript (`@patches/crypto`'s `encodeDeviceLinkOffer`
   * layout); the only bytes the authority device re-verifies its signature and SAS against. */
  @Column({ type: 'bytea' })
  declare offerBytes: Buffer;

  /** Ed25519 signature by the new device's own signing key over `offerBytes`. */
  @Column({ type: 'bytea' })
  declare deviceSignature: Buffer;

  @Column({ type: 'bigint' })
  declare signedPrekeyKeyId: string;

  @Column({ type: 'bytea' })
  declare signedPrekeyPublicKey: Buffer;

  @Column({ type: 'bytea' })
  declare signedPrekeySignature: Buffer;

  @Column({ type: 'timestamptz' })
  declare signedPrekeyCreatedAt: Date;

  @Column({ type: 'timestamptz' })
  declare signedPrekeyExpiresAt: Date;

  /** Device-signed prekey bundle transcript + signature, passed through verbatim to
   * `EnrollDevice` once the authority signs — the node never revalidates it here. */
  @Column({ type: 'bytea' })
  declare prekeyBundleBytes: Buffer;

  @Column({ type: 'bytea' })
  declare prekeyBundleSignature: Buffer;

  /** Public halves only, `{ keyId: string, publicKey: base64 string }[]`. */
  @Column({ type: 'jsonb' })
  declare oneTimePrekeys: { readonly keyId: string; readonly publicKey: string }[];

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  /** Always `createdAt` + 10 minutes, capped by the offer's own `expiresAtMs` (ADR 0037 §1). */
  @Column({ type: 'timestamptz' })
  declare expiresAt: Date;
}
