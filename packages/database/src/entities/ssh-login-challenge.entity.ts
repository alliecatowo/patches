import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { checkIn } from './enums.js';

/** What a challenge row was issued for (B-025) — replaces the earlier JSON-in-`claimed_handle`
 * enrollment-binding hack (`SshChallengeService`'s doc comment, pre-B-025). */
export const SSH_LOGIN_CHALLENGE_PURPOSES = ['LOGIN', 'ENROLL'] as const;
export type SshLoginChallengePurpose = (typeof SSH_LOGIN_CHALLENGE_PURPOSES)[number];

/**
 * A server-issued nonce for SSH challenge/response login (`INITIAL_VISION.md` §166,
 * `docs/architecture/auth.md` §4). The row exists server-side, rather than the challenge
 * being a self-contained signed token, so it can be consumed exactly once: a replayed
 * signature finds `consumed_at` already set.
 *
 * Challenges are issued whether or not the supplied fingerprint is enrolled — answering
 * differently would turn this endpoint into a key-enumeration oracle (§166).
 *
 * Login and enrollment (B-021) share this one table. `purpose`/`bound_user_id`/
 * `bound_fingerprint` (B-025) give enrollment its own dedicated binding columns rather than
 * JSON-encoding into `claimed_handle`, which keeps its original, narrower meaning (see below).
 */
@Entity({ name: 'ssh_login_challenges' })
@Index(['expiresAt'])
@Check('chk_ssh_login_challenges_purpose', checkIn('purpose', SSH_LOGIN_CHALLENGE_PURPOSES))
export class SshLoginChallenge {
  /** Also the challenge id bound into the signed blob. */
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  /** At least 32 bytes from a CSPRNG. `bytea`, so it is never a lossy string round-trip. */
  @Column({ type: 'bytea' })
  declare nonce: Buffer;

  /** Set only when the client claims a handle up front (login flow only — enrollment binds
   * through `boundUserId`/`boundFingerprint` instead). */
  @Column({ type: 'text', nullable: true })
  declare claimedHandle: string | null;

  /** `LOGIN` (default, `begin()`) or `ENROLL` (`beginEnrollment()`). */
  @Column({ type: 'text', default: 'LOGIN' })
  declare purpose: SshLoginChallengePurpose;

  /** Enrollment only: the authenticated user this proof may be redeemed for
   * (`consumeEnrollmentProof` rejects any other caller). `null` for login challenges. */
  @Column({ type: 'uuid', nullable: true })
  declare boundUserId: string | null;

  /** Enrollment only: the fingerprint of the key being enrolled, checked again against the
   * signing key at redemption. `null` for login challenges. */
  @Column({ type: 'text', nullable: true })
  declare boundFingerprint: string | null;

  /** TTL <= 120 seconds; expired rows are swept by a periodic job. */
  @Column({ type: 'timestamptz' })
  declare expiresAt: Date;

  /** Single-use; consumed atomically. */
  @Column({ type: 'timestamptz', nullable: true })
  declare consumedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
