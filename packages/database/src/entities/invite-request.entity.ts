import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A landing-page request for an invite (ADR 0044). Stored for the operator to read with
 * `patches-admin invite-requests list`; it never creates an account and never sends mail.
 *
 * Abuse posture: one pending row per normalized address (`uq_invite_requests_pending_contact`),
 * a per-peer rate limit and a global pending cap in the service. The requester's address is
 * hashed (`peer_hash`, SHA-256 of the rate-limit bucket) rather than stored, so the table holds
 * no IP address.
 */
@Entity({ name: 'invite_requests' })
@Index('uq_invite_requests_pending_contact', ['contactNormalized'], {
  unique: true,
  where: '"handled_at" IS NULL',
})
@Index('idx_invite_requests_created_at', ['createdAt'])
export class InviteRequest {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  /** The email address as entered (trimmed). */
  @Column({ type: 'text' })
  declare contact: string;

  /** Lowercased `contact`; the uniqueness key while the request is pending. */
  @Column({ type: 'text' })
  declare contactNormalized: string;

  /** Optional free text, at most 500 characters, control characters stripped. */
  @Column({ type: 'text', nullable: true })
  declare message: string | null;

  /** SHA-256 hex of the requester's rate-limit bucket (never the raw address). */
  @Column({ type: 'text' })
  declare peerHash: string;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  /** Set by `patches-admin invite-requests handle <id>`; NULL while pending. */
  @Column({ type: 'timestamptz', nullable: true })
  declare handledAt: Date | null;
}
