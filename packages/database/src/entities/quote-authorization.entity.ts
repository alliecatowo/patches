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
  QUOTE_AUTHORIZATION_STATES,
  QUOTE_POLICIES,
  type QuoteAuthorizationState,
  type QuotePolicy,
} from './enums.js';
import { Post } from './post.entity.js';

/**
 * FEP-044f quote-authorization evidence, as a lifecycle row rather than a boolean on the
 * quoting post (ADR 0028, P18-002; `docs/research/activitypub-social-depth.md` §2 —
 * revocation is real on Mastodon, so an authorization must be able to die without the
 * quote post dying with it).
 *
 * **Exactly-one semantics:** at most one row per (quoting post, quoted post) pair — the
 * pair mirrors the FEP-044f stamp's own identity (`interactingObject`,
 * `interactionTarget`), and the unique index enforces it wherever `quoting_post_id` is
 * set. Re-verification (FEP-044f's opportunistic stamp re-fetch) and revocation
 * (`Delete` of the stamp) are state transitions **on that one row**, never new rows; a
 * `REVOKED`/`REJECTED` row is kept, not deleted, so the display rule "still rendered,
 * just not as endorsed" (§193) has evidence to point at. `quoting_post_id` is nullable
 * because evidence can arrive before the quote post has a local row (e.g. a remote
 * `QuoteRequest` names a post this node never ingested); those partial rows do not join
 * the unique key until the post row exists.
 *
 * Schema only until P18-003+ — no inbox/outbox code writes it yet.
 */
@Entity({ name: 'quote_authorizations' })
@Check('chk_quote_authorizations_state', checkIn('state', QUOTE_AUTHORIZATION_STATES))
@Check('chk_quote_authorizations_policy', checkIn('claimed_policy', QUOTE_POLICIES))
// FEP-044f auto-approves self-quotes (same `attributedTo`); those never need a row.
@Check(
  'chk_quote_authorizations_not_self',
  'quoting_post_id IS NULL OR quoting_post_id <> quoted_post_id',
)
@Index(['quotingPostId', 'quotedPostId'], { unique: true })
// "Who quoted me and is it still approved" + revocation fan-out from the quoted side.
@Index(['quotedPostId', 'state'])
export class QuoteAuthorization {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  /** The post being quoted — the stamp's `interactionTarget`. May be a remote post (a
   * local row pointing at a remote object) or a local one. */
  @Column({ type: 'uuid' })
  declare quotedPostId: string;

  @ManyToOne(() => Post, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quoted_post_id' })
  declare quotedPost: Post;

  /** The quote post — the stamp's `interactingObject`. Nullable until the quote post has
   * a local row (see class doc: evidence can precede ingestion). */
  @Column({ type: 'uuid', nullable: true })
  declare quotingPostId: string | null;

  @ManyToOne(() => Post, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quoting_post_id' })
  declare quotingPost: Post | null;

  /** The quote post's author — explicit rather than derived through `quotingPostId`,
   * because it is known from the stamp/`QuoteRequest` alone, before any quote-post row
   * exists (FEP-044f stamps do not embed `interactingObject`, so this is the quoter's
   * identity as the remote side stated it, cross-checked at verify time). */
  @Column({ type: 'uuid' })
  declare quoterActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quoter_actor_id' })
  declare quoterActor: Actor;

  /** The remote `QuoteAuthorization` document URI (the `quoteAuthorization` property's
   * value on the quote post) — the thing §109-gated verification dereferences, and the
   * thing a revocation `Delete` names. Null when the evidence carries no stamp yet
   * (e.g. a `REJECTED` answer to a `QuoteRequest`, or a locally-issued acceptance). */
  @Column({ type: 'text', nullable: true })
  declare remoteStampUri: string | null;

  /** The quote policy the evidence claims was in force on the quoted post at issue time
   * (`ANYONE`/`FOLLOWERS`/`NOBODY` — same domain as `posts.quote_policy`). Evidence, not
   * truth: `posts.quote_policy` remains authoritative for what the post says *now*. */
  @Column({ type: 'text' })
  declare claimedPolicy: QuotePolicy;

  @Column({ type: 'text' })
  declare state: QuoteAuthorizationState;

  /** Set when the stamp was dereferenced and validated (or our own author accepted).
   * Null while `PENDING`. */
  @Column({ type: 'timestamptz', nullable: true })
  declare verifiedAt: Date | null;

  /** Set when approval was withdrawn (`Delete` of the stamp, or a local policy
   * revocation). Null while `PENDING`/`VERIFIED`/`REJECTED`. */
  @Column({ type: 'timestamptz', nullable: true })
  declare revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  declare updatedAt: Date;
}
