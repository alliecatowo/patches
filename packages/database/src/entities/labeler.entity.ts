import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Actor } from './actor.entity.js';
import { Community } from './community.entity.js';

/**
 * A labeler (`INITIAL_VISION.md` §200.1) — an actor, a community, or the node itself,
 * publishing labels from a closed vocabulary (§200.2, published in `GetNodePolicy`, not
 * enforced here). Exactly one of `actor_id`/`community_id`/`is_node_labeler` is set (`CHECK`).
 * A labeler operator's authority stops at their own labels (§200.5) — nothing in this schema
 * grants a labeler any authority over an actor, post, community, or node.
 */
@Entity({ name: 'labelers' })
@Check(
  'chk_labelers_one_owner',
  `("actor_id" IS NOT NULL AND "community_id" IS NULL AND "is_node_labeler" = false)
   OR ("actor_id" IS NULL AND "community_id" IS NOT NULL AND "is_node_labeler" = false)
   OR ("actor_id" IS NULL AND "community_id" IS NULL AND "is_node_labeler" = true)`,
)
export class Labeler {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid', nullable: true })
  declare actorId: string | null;

  @ManyToOne(() => Actor, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor | null;

  @Column({ type: 'uuid', nullable: true })
  declare communityId: string | null;

  @ManyToOne(() => Community, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'community_id' })
  declare community: Community | null;

  /** True for exactly one row per node — the node's own labeler, subscribed by default
   * (§200.3). Service-layer responsibility to keep it singular; nothing at this layer
   * enforces "at most one" beyond the exactly-one-owner `CHECK` above. */
  @Column({ type: 'boolean', default: false })
  declare isNodeLabeler: boolean;

  /** The closed vocabulary this labeler publishes (spec §200.2) — value/description/
   * default-action/mandatory tuples, shaped like `labels.proto`'s `LabelVocabularyEntry`.
   * Never free text at the `labels.value` call site; this is the allowlist `ApplyLabel`
   * validates against. */
  @Column({ type: 'jsonb' })
  declare vocabulary: unknown;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
