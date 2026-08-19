import { Check, Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import {
  checkIn,
  DOMAIN_BLOCK_SOURCES,
  MODERATION_REASON_CATEGORIES,
  type DomainBlockSource,
  type ModerationReasonCategory,
} from './enums.js';

/**
 * A blocked remote domain (`INITIAL_VISION.md` §109's "maintain domain blocks",
 * `docs/architecture/federation.md` §6). Enforced both directions (P8-006): a blocked
 * domain's inbound activities are rejected, and no outbound delivery is ever attempted to it.
 *
 * `domain` is the lowercase host only (no scheme/port) — the same normalized form
 * `Actor.homeServer` uses, so a lookup never has to normalize twice.
 *
 * `reasonCategory`/`source` (§201.5, §201.6, Amendment C) split the operator's free-text
 * `reason` from the bounded, node-published category `GetNodePolicy` exposes — the same
 * public/private split §201.4's moderation log uses. `source = IMPORTED` records provenance
 * only: `patches-admin domain block` remains the only write path either way, so an imported
 * reference blocklist can never write here by itself (§201.6).
 */
@Entity({ name: 'domain_blocks' })
@Check(
  'chk_domain_blocks_reason_category',
  checkIn('reason_category', MODERATION_REASON_CATEGORIES),
)
@Check('chk_domain_blocks_source', checkIn('source', DOMAIN_BLOCK_SOURCES))
export class DomainBlock {
  @PrimaryColumn({ type: 'text' })
  declare domain: string;

  @Column({ type: 'text', nullable: true })
  declare reason: string | null;

  @Column({ type: 'text', default: 'OTHER' })
  declare reasonCategory: ModerationReasonCategory;

  @Column({ type: 'text', default: 'MANUAL' })
  declare source: DomainBlockSource;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
