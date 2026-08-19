import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Actor } from './actor.entity.js';
import { Post } from './post.entity.js';

/**
 * A post pinned to an actor's profile (`INITIAL_VISION.md` §189). Composite PK, same shape as
 * `Like`/`Bookmark`. `position` is 0-2 (§188's 3-pin ceiling) and is display order, not a
 * timestamp — assigned/reassigned by `PinPost`'s service logic, never inferred.
 */
@Entity({ name: 'pinned_posts' })
@Check('chk_pinned_posts_position', `"position" BETWEEN 0 AND 2`)
export class PinnedPost {
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

  @Column({ type: 'smallint' })
  declare position: number;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
