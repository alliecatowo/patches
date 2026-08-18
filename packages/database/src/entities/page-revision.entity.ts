import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Actor } from './actor.entity.js';
import { Page } from './page.entity.js';

/**
 * Immutable document snapshot (`INITIAL_VISION.md` §171 — "a bad edit is recoverable and
 * moderation has an audit trail"). Rows are never updated or deleted by `PagesService`;
 * `UpdatePage` always inserts a new row and repoints `pages.current_revision_id` at it.
 *
 * `document` is the canonical-JSON `PatchesPage` (`packages/domain`'s `parsePageStrict` +
 * `serializePage`), stored as `jsonb` for future server-side introspection (e.g. a Phase 5
 * job scanning revisions for orphaned media references) even though `PagesService` itself
 * only ever round-trips it as opaque bytes.
 */
@Entity({ name: 'page_revisions' })
@Index(['pageId', 'revisionNumber'], { unique: true })
export class PageRevision {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare pageId: string;

  @ManyToOne(() => Page, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'page_id' })
  declare page: Page;

  /** Monotonic per `page_id`, starting at 1 — `ListPageRevisions`' natural sort key alongside
   * `created_at`. */
  @Column({ type: 'int' })
  declare revisionNumber: number;

  @Column({ type: 'jsonb' })
  declare document: Record<string, unknown>;

  /** UTF-8 byte size of the serialized document — denormalized so `ListPageRevisions` and the
   * §171 64 KiB limit check don't need to re-serialize the `jsonb` column to measure it. */
  @Column({ type: 'int' })
  declare byteSize: number;

  @Column({ type: 'uuid' })
  declare createdByActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_actor_id' })
  declare createdByActor: Actor;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
