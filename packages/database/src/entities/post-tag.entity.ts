import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Post } from './post.entity.js';
import { Tag } from './tag.entity.js';

/**
 * A post's membership in a tag (`INITIAL_VISION.md` §189). Composite PK, same shape as
 * `Like`/`Bookmark` — a post either has a tag or it doesn't, never twice.
 */
@Entity({ name: 'post_tags' })
// `ListTagFeed` (`FeedService.listTagFeed`) orders by the *joined* `posts.created_at DESC,
// posts.id DESC` — a `post_tags` index can never satisfy that `ORDER BY` (it's a different
// table's column, and `post_tags.created_at` drifts from `posts.created_at` after a retag:
// `TagExtractionService.extractAndAttach` deletes and re-inserts the row). What this index
// backs instead is the `tag_id = :tagId` filter/join predicate: an index-only scan hands
// Postgres every `post_id` for a tag without a heap fetch, which is what makes a rare tag's
// query cheap regardless of table size. A popular tag instead drives off `posts(created_at,
// id)` and probes this table's PK per candidate row — both plans are index-backed, measured
// with `EXPLAIN (ANALYZE, BUFFERS)`; no separate posts-side index is needed.
@Index(['tagId', 'createdAt', 'postId'])
export class PostTag {
  @PrimaryColumn({ type: 'uuid' })
  declare postId: string;

  @ManyToOne(() => Post, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  declare post: Post;

  @PrimaryColumn({ type: 'uuid' })
  declare tagId: string;

  @ManyToOne(() => Tag, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  declare tag: Tag;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
