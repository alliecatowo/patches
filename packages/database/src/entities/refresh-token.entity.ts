import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity.js';

/**
 * One issued refresh token (`INITIAL_VISION.md` §36). Tokens are opaque, high-entropy, and
 * stored **hashed only** — the plaintext exists exactly once, in the response to the client
 * (§36, §153).
 *
 * Rotation/reuse detection: every refresh issues a new row in the same `session_id` family
 * and stamps `used_at` on the old one. Presenting an already-`used_at` token means the token
 * leaked, so the whole family (every row sharing `session_id`) gets `revoked_at` set.
 */
@Entity({ name: 'refresh_tokens' })
@Index(['tokenHash'], { unique: true })
@Index(['userId', 'createdAt'])
@Index(['sessionId'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare userId: string;

  /** Credentials have no life without their user, so a hard user delete takes them along. */
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  declare user: User;

  /** Token family: every rotation of one login shares this id (§36). */
  @Column({ type: 'uuid' })
  declare sessionId: string;

  @Column({ type: 'text' })
  declare tokenHash: string;

  @Column({ type: 'timestamptz' })
  declare expiresAt: Date;

  /** Set when this token is rotated away; a second use of it is reuse (§36). */
  @Column({ type: 'timestamptz', nullable: true })
  declare usedAt: Date | null;

  /** Set on logout, or on family-wide revocation after reuse detection. */
  @Column({ type: 'timestamptz', nullable: true })
  declare revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  /** Best-effort session label for "log out other devices" UX. Never trusted for auth. */
  @Column({ type: 'text', nullable: true })
  declare userAgent: string | null;
}
