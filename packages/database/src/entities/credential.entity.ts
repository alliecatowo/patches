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
import { User } from './user.entity.js';
import { checkIn, CREDENTIAL_TYPES, type CredentialType } from './enums.js';

/**
 * A way to prove you are a {@link User} — **not** an identity (`INITIAL_VISION.md` §165,
 * ADR 0011). Adding, rotating, or revoking one never changes the actor, the handle, or any
 * social relationship, and an account may hold several at once (a password *and* two SSH
 * keys) or none of a given kind.
 *
 * Secret material is split by sensitivity on purpose: `secretHash` is an Argon2id hash that
 * must never be logged or leave the server (§101, §153), while `publicMaterial` is public by
 * construction (an OpenSSH public key) and safe to return to its owner.
 */
@Entity({ name: 'credentials' })
@Index(['userId', 'type'])
// Partial unique indexes: uniqueness applies to *live* credentials only, so a revoked key
// can be re-enrolled later without colliding with its own audit record. Predicates are
// written exactly as PostgreSQL echoes them back, so `migration:generate` sees no drift.
@Index(['type', 'identifier'], {
  unique: true,
  where: 'revoked_at IS NULL AND identifier IS NOT NULL',
})
@Index(['userId'], { unique: true, where: `type = 'PASSWORD' AND revoked_at IS NULL` })
@Check('chk_credentials_type', checkIn('type', CREDENTIAL_TYPES))
export class Credential {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare userId: string;

  /** Credentials have no life without their user. */
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  declare user: User;

  @Column({ type: 'text' })
  declare type: CredentialType;

  /**
   * Type-scoped lookup key: the OpenSSH `SHA256:` fingerprint for `SSH_PUBLIC_KEY`, GitHub's
   * **numeric** account id for `GITHUB` (never the login, which is mutable and reusable,
   * §167), and null for `PASSWORD` — a password login resolves the user by handle or
   * verified recovery email first, so there is nothing to look up here.
   */
  @Column({ type: 'text', nullable: true })
  declare identifier: string | null;

  /** Argon2id hash, `PASSWORD` only (§34). Never logged, never in a DTO. */
  @Column({ type: 'text', nullable: true })
  declare secretHash: string | null;

  /** OpenSSH public key blob, `SSH_PUBLIC_KEY` only. Public, safe to return. */
  @Column({ type: 'text', nullable: true })
  declare publicMaterial: string | null;

  /** Non-secret provider bookkeeping (key type, GitHub login for display). */
  @Column({ type: 'jsonb', nullable: true })
  declare metadata: Record<string, unknown> | null;

  /** User-supplied label ("work laptop"). */
  @Column({ type: 'text', nullable: true })
  declare label: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare lastUsedAt: Date | null;

  /** Revocation is soft; rows are retained for audit. */
  @Column({ type: 'timestamptz', nullable: true })
  declare revokedAt: Date | null;
}
