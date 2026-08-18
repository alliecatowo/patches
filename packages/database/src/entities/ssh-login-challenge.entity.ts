import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A server-issued nonce for SSH challenge/response login (`INITIAL_VISION.md` §166,
 * `docs/architecture/auth.md` §4). The row exists server-side, rather than the challenge
 * being a self-contained signed token, so it can be consumed exactly once: a replayed
 * signature finds `consumed_at` already set.
 *
 * Challenges are issued whether or not the supplied fingerprint is enrolled — answering
 * differently would turn this endpoint into a key-enumeration oracle (§166).
 */
@Entity({ name: 'ssh_login_challenges' })
@Index(['expiresAt'])
export class SshLoginChallenge {
  /** Also the challenge id bound into the signed blob. */
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  /** At least 32 bytes from a CSPRNG. `bytea`, so it is never a lossy string round-trip. */
  @Column({ type: 'bytea' })
  declare nonce: Buffer;

  /** Set only when the client claims a handle up front. */
  @Column({ type: 'text', nullable: true })
  declare claimedHandle: string | null;

  /** TTL <= 120 seconds; expired rows are swept by a periodic job. */
  @Column({ type: 'timestamptz' })
  declare expiresAt: Date;

  /** Single-use; consumed atomically. */
  @Column({ type: 'timestamptz', nullable: true })
  declare consumedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
