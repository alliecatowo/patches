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
import { AUTH_CODE_PURPOSES, checkIn, type AuthCodePurpose } from './enums.js';

/**
 * A short-lived, single-use code emailed to a user — email verification (§38) and password
 * reset (§39) share one table discriminated by `purpose`, because the two have identical
 * shape and identical lifecycle rules; splitting them would duplicate every expiry,
 * consumption and throttling query.
 *
 * Stored hashed and never logged (§101). `attempts` backs per-code throttling so a 6-digit
 * code can't be brute-forced (§102).
 */
@Entity({ name: 'auth_codes' })
@Index(['userId', 'purpose', 'createdAt'])
@Index(['codeHash'])
@Check('chk_auth_codes_purpose', checkIn('purpose', AUTH_CODE_PURPOSES))
export class AuthCode {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare userId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  declare user: User;

  @Column({ type: 'text' })
  declare purpose: AuthCodePurpose;

  @Column({ type: 'text' })
  declare codeHash: string;

  @Column({ type: 'timestamptz' })
  declare expiresAt: Date;

  /** Single use: set the moment the code is accepted. */
  @Column({ type: 'timestamptz', nullable: true })
  declare consumedAt: Date | null;

  /** Failed verification attempts against this code. */
  @Column({ type: 'int', default: 0 })
  declare attempts: number;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
