import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Actor } from './actor.entity.js';

/**
 * Account deletion with a grace period (`INITIAL_VISION.md` §197.4). One row per actor —
 * `actorId` is the PK, same shape as `ActorFlair`/`FederationKey`. `RequestAccountDeletion`
 * inserts (or re-activates) this row and the account becomes `PENDING_DELETION` immediately;
 * `purgeAfter` is computed at request time from the node's published grace period (default 30
 * days, node-configurable, §204) and is a plain column, not a database default, since the
 * grace period is operator-configured rather than a schema-fixed constant.
 * `CancelAccountDeletion` sets `cancelledAt` and restores the account intact within the grace
 * period; a worker job purges the account once `now() > purgeAfter` and `cancelledAt IS NULL`.
 */
@Entity({ name: 'account_deletion_requests' })
export class AccountDeletionRequest {
  @PrimaryColumn({ type: 'uuid' })
  declare actorId: string;

  @OneToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  @Column({ type: 'timestamptz' })
  declare requestedAt: Date;

  @Column({ type: 'timestamptz' })
  declare purgeAfter: Date;

  /** Null unless a pending deletion was cancelled. */
  @Column({ type: 'timestamptz', nullable: true })
  declare cancelledAt: Date | null;

  /** Null until the purge worker has actually run. */
  @Column({ type: 'timestamptz', nullable: true })
  declare purgedAt: Date | null;
}
