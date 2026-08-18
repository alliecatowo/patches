import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Actor } from './actor.entity.js';
import { checkIn, USER_STATUSES, type UserStatus } from './enums.js';

/**
 * A local authenticated account (`INITIAL_VISION.md` §20, §162+ / ADR 0011). Holds *no*
 * secret material: credentials are separate rows in `credentials`, so one account can log in
 * with a password, an SSH key, GitHub, or a passkey, and email is only ever a recovery
 * channel — never the identity itself. The public social identity lives on the paired
 * {@link Actor} (§19).
 */
@Entity({ name: 'users' })
@Index(['recoveryEmailNormalized'], { unique: true })
@Check('chk_users_status', checkIn('status', USER_STATUSES))
export class User {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  /**
   * Optional recovery address, as entered. Nullable because email is not required to have an
   * account (§162+): an SSH-key-only account may never supply one. Uniqueness is enforced on
   * `recoveryEmailNormalized`, never on this column.
   */
  @Column({ type: 'text', nullable: true })
  declare recoveryEmail: string | null;

  /** Lowercased/normalized form of `recoveryEmail`; unique where present (NULLs are distinct). */
  @Column({ type: 'text', nullable: true })
  declare recoveryEmailNormalized: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  declare emailVerifiedAt: Date | null;

  @Column({ type: 'text', default: 'ACTIVE' })
  declare status: UserStatus;

  @Column({ type: 'uuid', unique: true })
  declare actorId: string;

  /**
   * `ON DELETE RESTRICT`: an actor may never be hard-deleted out from under the account that
   * owns it. Deletion is a tombstone (`deleted_at`), not a row destruction (§25).
   */
  @ManyToOne(() => Actor, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  declare updatedAt: Date;

  /** Soft delete — see the note on {@link Actor.deletedAt}. */
  @Column({ type: 'timestamptz', nullable: true })
  declare deletedAt: Date | null;
}
