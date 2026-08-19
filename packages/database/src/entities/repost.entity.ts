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
import { Post } from './post.entity.js';

/**
 * A repost — a pointer row, exactly like a {@link Like}/{@link Bookmark}, never a duplicate
 * of the post's content (`INITIAL_VISION.md` §189, §190). Has a surrogate `id` (unlike
 * `Like`/`Bookmark`) because §189 lists one explicitly for `reposts`.
 */
@Entity({ name: 'reposts' })
@Index(['actorId', 'postId'], { unique: true })
// §189's required indexes. The `post_id` index carries an `id` tiebreaker beyond what §189's
// literal column list shows — same reasoning as every other keyset-paginated list in this
// schema (§46): `ListPostReposters` needs a stable order for two reposts with an identical
// `created_at`, and this table (unlike `Like`/`Bookmark`) has a surrogate id to use for it.
@Index(['actorId', 'createdAt', 'id'])
@Index(['postId', 'createdAt', 'id'])
export class Repost {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  @Column({ type: 'uuid' })
  declare postId: string;

  @ManyToOne(() => Post, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  declare post: Post;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
