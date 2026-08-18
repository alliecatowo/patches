import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Actor } from './actor.entity.js';
import {
  checkIn,
  POST_TYPES,
  POST_VISIBILITIES,
  type PostType,
  type PostVisibility,
} from './enums.js';

/**
 * A post — or a reply, which is the same thing (`INITIAL_VISION.md` §23–24). There is no
 * separate comment entity.
 *
 * Threading: `in_reply_to_id` is the immediate parent (null for a root post) and
 * `root_post_id` is the thread root, which for a root post is **its own id** — so the
 * service must generate the UUID before insert rather than relying on the column default.
 * That representation means thread reads never walk upward recursively (§24).
 */
@Entity({ name: 'posts' })
// §60 required indexes. Keyset pagination orders by (created_at DESC, id DESC) (§46), and
// the mixed direction on the author feed index is load-bearing: PostgreSQL can scan an
// all-ASC index backwards, but not one where only some columns are reversed.
@Index(['authorActorId', 'createdAt', 'id'])
@Index(['createdAt', 'id'])
@Index(['rootPostId', 'createdAt', 'id'])
@Index(['inReplyToId', 'createdAt', 'id'])
@Index(['canonicalUri'], { unique: true })
// Idempotent creation under retry (§45): a duplicated CreatePost with the same
// client_request_id hits this constraint instead of creating a second post. No partial
// `WHERE client_request_id IS NOT NULL` predicate is needed — PostgreSQL treats NULLs as
// distinct in a unique index, so posts without an idempotency key never collide.
@Index(['authorActorId', 'clientRequestId'], { unique: true })
@Check('chk_posts_post_type', checkIn('post_type', POST_TYPES))
@Check('chk_posts_visibility', checkIn('visibility', POST_VISIBILITIES))
// A LINK post must carry its URL. The full §23 rule ("a post has text, an image, or a
// link") also depends on `post_media` rows, which a row-level CHECK cannot see — that half
// is enforced in the service layer (documented in docs/architecture/data-model.md).
@Check('chk_posts_link_url_required_for_link', `"post_type" <> 'LINK' OR "link_url" IS NOT NULL`)
export class Post {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare authorActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'author_actor_id' })
  declare authorActor: Actor;

  /** Nullable: a link-only or image-only post is valid (§23). Max 5,000 chars (§58). */
  @Column({ type: 'text', nullable: true })
  declare body: string | null;

  @Column({ type: 'text', default: 'NOTE' })
  declare postType: PostType;

  @Column({ type: 'text', nullable: true })
  declare linkUrl: string | null;

  @Column({ type: 'text', default: 'PUBLIC' })
  declare visibility: PostVisibility;

  /** Optional click-to-reveal label (e.g. "spoilers"); null means none. */
  @Column({ type: 'text', nullable: true })
  declare contentWarning: string | null;

  @Column({ type: 'uuid', nullable: true })
  declare inReplyToId: string | null;

  /**
   * Self-referencing FKs use the default `NO ACTION`, not `RESTRICT`: a root post's
   * `root_post_id` points at its own row, and PostgreSQL checks `RESTRICT` immediately
   * (which would make such a row undeletable) while `NO ACTION` is checked at end of
   * statement and therefore tolerates the self-reference.
   */
  @ManyToOne(() => Post, { nullable: true })
  @JoinColumn({ name: 'in_reply_to_id' })
  declare inReplyTo: Post | null;

  @Column({ type: 'uuid' })
  declare rootPostId: string;

  /**
   * The relation is declared `nullable: true` even though the **column is `NOT NULL`** (see
   * `rootPostId` above, which is what drives the DDL). TypeORM 1.x's metadata validator
   * rejects a non-nullable self-referencing relation outright with `CircularRelationsError`
   * — and it is wrong about the risk here, because a root post satisfies the constraint by
   * pointing at itself within its own INSERT.
   */
  @ManyToOne(() => Post, { nullable: true })
  @JoinColumn({ name: 'root_post_id' })
  declare rootPost: Post;

  @Column({ type: 'text', nullable: true })
  declare canonicalUri: string | null;

  @Column({ type: 'text', nullable: true })
  declare originServer: string | null;

  @Column({ type: 'boolean', default: true })
  declare isLocal: boolean;

  /** Client-generated idempotency key (§45). */
  @Column({ type: 'uuid', nullable: true })
  declare clientRequestId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  declare updatedAt: Date;

  /** Set on edit; `created_at` is preserved and an edit is never a new post (§26). */
  @Column({ type: 'timestamptz', nullable: true })
  declare editedAt: Date | null;

  /** Tombstone — see the note on {@link Actor.deletedAt}. Renders as `[deleted]` (§25). */
  @Column({ type: 'timestamptz', nullable: true })
  declare deletedAt: Date | null;
}
