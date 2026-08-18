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
import { checkIn, PAGE_VISIBILITIES, type PageVisibility } from './enums.js';
import { PageRevision } from './page-revision.entity.js';

/**
 * One row per actor — the actor's Patches Page site, pointing at its current immutable
 * revision (`INITIAL_VISION.md` §170-172, `docs/architecture/pages.md` §3). The document
 * itself (the `PatchesPage` JSON, which embeds every sub-page's slug/title/blocks under one
 * `pages: [...]` array — see `packages/domain`) lives on {@link PageRevision}, never here:
 * this row is deliberately thin so `UpdatePage`'s "write a new revision, then repoint
 * `current_revision_id`" is a single cheap `UPDATE`.
 *
 * `current_revision_id` is nullable because a `Page` row can exist (created lazily on first
 * `UpdatePage`) before its first revision is inserted — the two inserts happen in the same
 * transaction, but the column still has to accept `NULL` for the brief instant between them.
 */
@Entity({ name: 'pages' })
@Index(['actorId'], { unique: true })
@Check('chk_pages_visibility', checkIn('visibility', PAGE_VISIBILITIES))
export class Page {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  @Column({ type: 'uuid', nullable: true })
  declare currentRevisionId: string | null;

  @ManyToOne(() => PageRevision, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'current_revision_id' })
  declare currentRevision: PageRevision | null;

  /** `PUBLIC` | `UNLISTED` (mirrors `posts.visibility`'s vocabulary, minus `FOLLOWERS` — a
   * Page has no follower-only mode in v1). */
  @Column({ type: 'text', default: 'PUBLIC' })
  declare visibility: PageVisibility;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  declare updatedAt: Date;
}
