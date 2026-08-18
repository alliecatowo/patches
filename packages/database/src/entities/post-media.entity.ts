import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Media } from './media.entity.js';
import { Post } from './post.entity.js';

/** Maximum images attached to one post (`INITIAL_VISION.md` §28). */
export const MAX_POST_MEDIA = 4;

/**
 * Explicit join entity between posts and media (§27, §61) — not an ORM many-to-many, so
 * ordering (and any future per-attachment metadata) has somewhere to live.
 *
 * The 4-images-per-post cap (§28) is enforced by the database, not just the service: the
 * composite key plus `UNIQUE (post_id, position)` and `0 <= position < 4` together make a
 * fifth attachment impossible.
 */
@Entity({ name: 'post_media' })
@Index(['postId', 'position'], { unique: true })
@Check('chk_post_media_position', `"position" >= 0 AND "position" < ${MAX_POST_MEDIA}`)
export class PostMedia {
  @PrimaryColumn({ type: 'uuid' })
  declare postId: string;

  /**
   * The only `ON DELETE CASCADE` in the schema: an attachment row has no lifecycle of its
   * own, so hard-deleting a post row (admin purge — normal deletion is a tombstone) must
   * take its join rows with it. `media_id` is `RESTRICT` because media *does* have an
   * independent lifecycle and must not silently detach itself from a live post.
   */
  @ManyToOne(() => Post, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  declare post: Post;

  @PrimaryColumn({ type: 'uuid' })
  declare mediaId: string;

  @ManyToOne(() => Media, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'media_id' })
  declare media: Media;

  /** 0-based display order. */
  @Column({ type: 'int' })
  declare position: number;
}
