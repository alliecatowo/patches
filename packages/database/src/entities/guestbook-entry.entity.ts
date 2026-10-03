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
import { Page } from './page.entity.js';

/**
 * A guestbook entry — hostile input by default (`INITIAL_VISION.md` §172: "guestbooks are
 * spam magnets; treat entry creation as hostile input"). `SignGuestbook` (`PagesService`) is
 * rate-limited and block-aware before a row is ever inserted; this entity only stores the
 * result.
 *
 * `removed_at`/`removed_by_actor_id` is a plain tombstone pair, matching `Post.deletedAt`'s
 * convention (never `@DeleteDateColumn`, which would silently filter removed rows out of
 * every `find()` — a removed entry still needs to be distinguishable from one that was never
 * there, for the page owner's own moderation view). `removed_by_actor_id` is an *actor*, not
 * a user, because the identity available to `RemoveGuestbookEntry`'s caller is the session's
 * `actorId` (same as every other user-facing moderation action in this codebase — `Block`/
 * `Mute`/etc.), unlike `reports.resolved_by_user_id`, which the admin CLI writes from a
 * `User`.
 */
@Entity({ name: 'guestbook_entries' })
@Index(['pageId', 'createdAt'])
export class GuestbookEntry {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare pageId: string;

  @ManyToOne(() => Page, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'page_id' })
  declare page: Page;

  /** Nullable for a future non-local/remote signer; every entry `SignGuestbook` itself
   * creates has one, since that RPC requires an authenticated session. */
  @Column({ type: 'uuid', nullable: true })
  declare authorActorId: string | null;

  @ManyToOne(() => Actor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_actor_id' })
  declare authorActor: Actor | null;

  /** Plain text, sanitized (`packages/domain`'s `sanitizeText`), at most 500 characters
   * (§171). */
  @Column({ type: 'text' })
  declare body: string;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare removedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  declare removedByActorId: string | null;

  @ManyToOne(() => Actor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'removed_by_actor_id' })
  declare removedByActor: Actor | null;
}
