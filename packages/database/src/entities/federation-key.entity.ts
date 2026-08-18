import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Actor } from './actor.entity.js';

/**
 * Local actors' own RSA-2048 keypair for HTTP Signatures (`INITIAL_VISION.md` §109,
 * `docs/research/activitypub.md`). One row per local actor, created lazily the first time
 * that actor needs to sign an outgoing request or publish an actor document with a
 * `publicKey` (`KeyService.getOrCreateKeyPair`).
 *
 * `privateKeyCiphertext`/`privateKeyIv`/`privateKeyTag` (B-026) hold the PKCS#8 PEM encrypted
 * with AES-256-GCM under `FEDERATION_KEY_ENCRYPTION_KEY` — see
 * `packages/database/src/crypto/federation-key-cipher.ts`. There was never a deployed row with
 * the old plain `private_key_pem` column (Stage F1 is pre-launch), so the migration changes
 * the column shape directly rather than running an expand/contract pair across two migrations.
 */
@Entity({ name: 'federation_keys' })
export class FederationKey {
  @PrimaryColumn({ type: 'uuid' })
  declare actorId: string;

  @OneToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  /** SPKI PEM, embedded verbatim into the actor document's `publicKey.publicKeyPem`. */
  @Column({ type: 'text' })
  declare publicKeyPem: string;

  /** AES-256-GCM ciphertext of the PKCS#8 private key PEM. */
  @Column({ type: 'bytea' })
  declare privateKeyCiphertext: Buffer;

  /** 96-bit GCM nonce used for `privateKeyCiphertext`, unique per row. */
  @Column({ type: 'bytea' })
  declare privateKeyIv: Buffer;

  /** GCM authentication tag for `privateKeyCiphertext`. */
  @Column({ type: 'bytea' })
  declare privateKeyTag: Buffer;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
