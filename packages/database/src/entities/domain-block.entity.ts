import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * A blocked remote domain (`INITIAL_VISION.md` §109's "maintain domain blocks",
 * `docs/architecture/federation.md` §6). Enforced both directions (P8-006): a blocked
 * domain's inbound activities are rejected, and no outbound delivery is ever attempted to it.
 *
 * `domain` is the lowercase host only (no scheme/port) — the same normalized form
 * `Actor.homeServer` uses, so a lookup never has to normalize twice.
 */
@Entity({ name: 'domain_blocks' })
export class DomainBlock {
  @PrimaryColumn({ type: 'text' })
  declare domain: string;

  @Column({ type: 'text', nullable: true })
  declare reason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
