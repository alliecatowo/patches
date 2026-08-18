import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Actor } from './actor.entity.js';

/**
 * A local actor's own RSA-2048 keypair for HTTP Signatures (`INITIAL_VISION.md` §109,
 * `docs/research/activitypub.md`). One row per local actor, created lazily the first time
 * that actor needs to sign an outgoing request or publish an actor document with a
 * `publicKey` (`KeyService.getOrCreateKeyPair`).
 *
 * `privateKeyPem` is stored **plain**, not encrypted at rest. This is a deliberate, documented
 * v0.1/Stage-F1 gap, not an oversight: the spec's secrets-management guidance (§101) does not
 * specify a KMS/encryption-at-rest scheme, and the federation lab is explicitly local and
 * non-public (`docs/architecture/federation.md` §3.5 — Stage F1 is v0.1, run locally). Encrypt
 * this column (or move it to an operator-supplied server key, or an actual KMS) before Stage
 * F3 (public federation, §108, §160's readiness checklist) — filed as a follow-up in this
 * task's report.
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

  /** PKCS#8 PEM. See the class doc comment — plain at rest in v0.1. */
  @Column({ type: 'text' })
  declare privateKeyPem: string;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
