import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Actor } from './actor.entity.js';

/**
 * A block edge (`INITIAL_VISION.md` §61–62). Composite PK, matching the shape
 * `docs/architecture/data-model.md`'s `blocks` section documents — there is no surrogate `id`
 * because a block is only ever looked up or removed by its `(blocker, blocked)` pair, never by
 * itself.
 *
 * No RPC creates rows here yet (`BlockActor`/`UnblockActor` are Phase 6, spec §140) — this
 * table exists now purely so the feed/relationship SQL (`ListHomeFeed`, `ListLocalFeed`,
 * `GetRelationship`) has something to join against ahead of that RPC landing (§59).
 */
@Entity({ name: 'blocks' })
@Check('chk_blocks_no_self_block', `"blocker_actor_id" <> "blocked_actor_id"`)
export class Block {
  @PrimaryColumn({ type: 'uuid' })
  declare blockerActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blocker_actor_id' })
  declare blockerActor: Actor;

  @PrimaryColumn({ type: 'uuid' })
  declare blockedActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blocked_actor_id' })
  declare blockedActor: Actor;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
