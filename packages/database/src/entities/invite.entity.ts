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

/**
 * An invite code for invite-only registration (`INITIAL_VISION.md` §38), created and listed
 * through `patches-admin` (§65). Like every other credential in the schema, only the hash is
 * stored — the plaintext code is shown once, when it is minted.
 */
@Entity({ name: 'invites' })
@Index(['codeHash'], { unique: true })
@Index(['createdByUserId', 'createdAt'])
@Check('chk_invites_uses_within_max', `"uses" >= 0 AND "max_uses" >= 1 AND "uses" <= "max_uses"`)
export class Invite {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'text' })
  declare codeHash: string;

  @Column({ type: 'uuid' })
  declare createdByUserId: string;

  /** `RESTRICT`: invites are an audit trail of who let whom in (§66). */
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_user_id' })
  declare createdByUser: User;

  @Column({ type: 'int', default: 1 })
  declare maxUses: number;

  @Column({ type: 'int', default: 0 })
  declare uses: number;

  @Column({ type: 'timestamptz', nullable: true })
  declare expiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  declare revokedAt: Date | null;

  /** Operator-facing note ("alpha wave 2", "conference"), never shown to the invitee. */
  @Column({ type: 'text', nullable: true })
  declare note: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
