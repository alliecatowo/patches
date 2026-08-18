import { Check, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Actor } from './actor.entity.js';

/**
 * A mute edge (`INITIAL_VISION.md` §61, §63). Composite PK — see {@link Block}'s comment,
 * which applies identically here.
 *
 * No RPC creates rows here yet (`MuteActor`/`UnmuteActor` are Phase 6, spec §140); the table
 * exists now so `ListHomeFeed`'s "author not muted" clause (§59) has something to join
 * against.
 */
@Entity({ name: 'mutes' })
@Check('chk_mutes_no_self_mute', `"muter_actor_id" <> "muted_actor_id"`)
export class Mute {
  @PrimaryColumn({ type: 'uuid' })
  declare muterActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'muter_actor_id' })
  declare muterActor: Actor;

  @PrimaryColumn({ type: 'uuid' })
  declare mutedActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'muted_actor_id' })
  declare mutedActor: Actor;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
