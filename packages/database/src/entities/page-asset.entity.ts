import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Media } from './media.entity.js';
import { Page } from './page.entity.js';

/**
 * Media referenced by a page, counted against `capabilities.maxSiteStorageBytes` (§174).
 * A placeholder table for Phase 5 (`INITIAL_VISION.md` §176 — `Image`/`Gallery` are defined
 * in the document schema at Phase 4.5 but render as placeholders until the media pipeline
 * exists, P45-005): nothing in this task's `PagesService` writes to it yet — a future Phase 5
 * task populates it from `UpdatePage`'s `Image`/`Gallery` `mediaId` references, so storage
 * accounting exists before the pipeline that needs it does.
 *
 * Remote URLs are never referenced here — `media_id` always points at Patches-owned media
 * (`INITIAL_VISION.md` §172).
 */
@Entity({ name: 'page_assets' })
@Index(['pageId', 'mediaId'], { unique: true })
export class PageAsset {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare pageId: string;

  @ManyToOne(() => Page, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'page_id' })
  declare page: Page;

  @Column({ type: 'uuid' })
  declare mediaId: string;

  @ManyToOne(() => Media, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'media_id' })
  declare media: Media;

  /** Denormalized for cheap storage-cap accounting without a join to `media`. `bigint` comes
   * back from the `pg` driver as a string (see `Media.byteSize`'s same note). */
  @Column({ type: 'bigint' })
  declare byteSize: string;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
