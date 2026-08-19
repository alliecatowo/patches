import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Post } from './post.entity.js';
import { Tag } from './tag.entity.js';

/**
 * A post's membership in a tag (`INITIAL_VISION.md` §189). Composite PK, same shape as
 * `Like`/`Bookmark` — a post either has a tag or it doesn't, never twice.
 */
@Entity({ name: 'post_tags' })
// §189's required index: `ListTagFeed` pages a tag's posts by `(created_at DESC, post_id
// DESC)` — `post_id` is the tiebreaker, already unique per `tag_id` (the PK).
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
