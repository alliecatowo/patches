import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A hashtag (`INITIAL_VISION.md` §181, §189). `name` is the canonical form — NFKC-normalized
 * and casefolded (§192, hostile-input hardening for tag names) — while `displayName` keeps
 * whoever first used the tag's original casing for rendering. Deliberately has **no**
 * `post_count`/popularity column (§181): there is no engagement ranking in this product, and
 * a live count is computed from `post_tags` when needed rather than cached and gradually
 * drifting.
 */
@Entity({ name: 'tags' })
@Index(['name'], { unique: true })
export class Tag {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  /** Max 30 characters, at least one letter (§188) — enforced in the service layer. */
  @Column({ type: 'text' })
  declare name: string;

  @Column({ type: 'text' })
  declare displayName: string;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
