import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Actor } from './actor.entity.js';
import { Post } from './post.entity.js';

/**
 * A bookmark edge (`INITIAL_VISION.md` §53). Bookmarks are private — only ever readable by
 * their own `actor_id` (enforced in `ReactionService`, never by anything at this layer).
 * Composite PK, same shape as `Like`.
 */
@Entity({ name: 'bookmarks' })
// `ListBookmarks` pages the caller's own bookmarks by `(created_at DESC, post_id DESC)` —
// `post_id` is the tiebreaker, already unique per `actor_id` (the PK).
@Index(['actorId', 'createdAt', 'postId'])
export class Bookmark {
  @PrimaryColumn({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  @PrimaryColumn({ type: 'uuid' })
  declare postId: string;

  @ManyToOne(() => Post, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  declare post: Post;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
