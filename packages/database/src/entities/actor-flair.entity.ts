import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Actor } from './actor.entity.js';

/**
 * Free-form, allow-listed self-presentation (`INITIAL_VISION.md` §189, §192) — distinct from
 * `Actor.nameplate` (server-attested badges, colors). Max 1 KiB serialized (§188); allow-list
 * enforcement, control/escape-sequence stripping, and the "no images/uploads" rule all live
 * in the service layer, not here. One row per actor — `actorId` is the PK, no surrogate id.
 */
@Entity({ name: 'actor_flair' })
export class ActorFlair {
  @PrimaryColumn({ type: 'uuid' })
  declare actorId: string;

  @OneToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  /** JSON document, shape owned by the client renderer (§192) — the server only validates
   * size and strips unsafe bytes, it does not interpret the document's keys. */
  @Column({ type: 'jsonb' })
  declare document: unknown;

  @UpdateDateColumn({ type: 'timestamptz' })
  declare updatedAt: Date;
}
