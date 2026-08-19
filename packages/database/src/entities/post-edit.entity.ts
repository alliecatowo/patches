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
 * A snapshot of a post's prior state, taken immediately before `EditPost` overwrites it
 * (`INITIAL_VISION.md` §189). Up to 20 per post (§188), enforced in the service layer.
 * `previousMediaManifest` is `jsonb` (an array of the prior `MediaAttachment`-shaped
 * objects) rather than a relation — `post_media` rows are mutable/deletable and this needs to
 * freeze what the media looked like at edit time, not track it live.
 */
@Entity({ name: 'post_edits' })
@Index(['postId', 'createdAt', 'id'])
export class PostEdit {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare postId: string;

  @ManyToOne(() => Post, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  declare post: Post;

  @Column({ type: 'text', nullable: true })
  declare previousBody: string | null;

  @Column({ type: 'text', nullable: true })
  declare previousContentWarning: string | null;

  @Column({ type: 'jsonb', nullable: true })
  declare previousMediaManifest: unknown[] | null;

  /** Nullable, `SET NULL`: same "audit column survives account deletion" pattern as
   * `CommunityBan.bannedByActorId`/`Message.senderActorId` — an edit history entry must
   * outlive the actor who made it. */
  @Column({ type: 'uuid', nullable: true })
  declare editedByActorId: string | null;

  @ManyToOne(() => Actor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'edited_by_actor_id' })
  declare editedByActor: Actor | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
