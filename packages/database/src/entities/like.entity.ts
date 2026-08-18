import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Actor } from './actor.entity.js';
import { Post } from './post.entity.js';

/**
 * A like edge (`INITIAL_VISION.md` §53). Composite PK, same shape as `Follow`/`Block`/`Mute`:
 * a like is only ever looked up or removed by its `(actor, post)` pair, never by itself, so
 * there is no surrogate `id`.
 */
@Entity({ name: 'likes' })
// §60-style required index: `ListPostLikers` pages a single post's likers by
// `(created_at DESC, actor_id DESC)` — `actor_id` is the tiebreaker instead of a surrogate id
// because it is already unique per `post_id` (the PK), so it costs nothing extra to index.
@Index(['postId', 'createdAt', 'actorId'])
export class Like {
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
