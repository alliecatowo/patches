import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Media } from './media.entity.js';
import { User } from './user.entity.js';

/**
 * A social identity — local or (later) remote (`INITIAL_VISION.md` §19, §21). Deliberately
 * separate from `User`: federation introduces remote actors that have no local credentials,
 * so `user_id` is nullable even though every actor in v0 has one.
 *
 * Every `@Column` specifies an explicit `type` — see the package README (esbuild does not
 * emit `emitDecoratorMetadata`); `entity-column-types.test.ts` enforces it.
 */
@Entity({ name: 'actors' })
@Index(['handleNormalized'], { unique: true })
@Index(['canonicalUri'], { unique: true })
// A-021: idempotency for `AuthService.Register` (spec §45) — a retried registration with the
// same `(handle_normalized, client_request_id)` should hit this constraint instead of
// colliding on the plain `handleNormalized` unique index above and erroring `HANDLE_TAKEN`.
// Same NULL-is-distinct reasoning as `Post.clientRequestId` (`post.entity.ts`): an actor
// created outside `Register` (a remote/federated actor, or a future non-register creation
// path) simply never sets this column, and any number of such actors coexist under one
// `handleNormalized` value without colliding — not that duplicate handles are otherwise
// allowed, the plain unique index above still forbids that.
//
// This is the schema half of A-021 only: `AuthService.register` actually checking this
// column before insert is a follow-up for whoever next touches `apps/server/src/modules/
// auth/**`, which is out of this task's file scope (see docs/agents/LEARNINGS.md / this
// task's report).
@Index(['handleNormalized', 'clientRequestId'], { unique: true })
// #223: GIN trigram indexes for `ActorService.searchActors` (`AddActorsTrigramSearchIndexes`
// migration). `synchronize: false` names them so `migration:generate` knows they exist and
// leaves them alone — TypeORM's `@Index` decorator has no vocabulary for a non-default
// operator class (`gin_trgm_ops`), so they can never be declared column-accurately; without
// this, every `db:generate` run proposes dropping and can't correctly recreate them.
@Index('idx_actors_handle_normalized_trgm', { synchronize: false })
@Index('idx_actors_display_name_trgm', { synchronize: false })
export class Actor {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  /** Null for remote actors (federation); unique among local ones. */
  @Column({ type: 'uuid', nullable: true, unique: true })
  declare userId: string | null;

  /**
   * Unidirectional on purpose: `users.actor_id` and `actors.user_id` are two separate
   * columns (both required by §20/§21), not two sides of one TypeORM relation. Hard-deleting
   * a user leaves the actor row behind with a null `user_id` — the same shape a remote actor
   * has — rather than destroying social history.
   */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  declare user: User | null;

  /** Display form, may preserve the case the user typed (§22). */
  @Column({ type: 'text' })
  declare handle: string;

  /** Lowercase ASCII canonical form; uniqueness is enforced on this, never on `handle`. */
  @Column({ type: 'text' })
  declare handleNormalized: string;

  /** `AuthService.Register`'s idempotency key (spec §45, A-021). Null for an actor created
   * outside `Register` (e.g. a future remote/federated actor). */
  @Column({ type: 'uuid', nullable: true })
  declare clientRequestId: string | null;

  @Column({ type: 'text', nullable: true })
  declare displayName: string | null;

  @Column({ type: 'text', nullable: true })
  declare bio: string | null;

  @Column({ type: 'text', nullable: true })
  declare locationText: string | null;

  @Column({ type: 'text', nullable: true })
  declare websiteUrl: string | null;

  @Column({ type: 'uuid', nullable: true })
  declare avatarMediaId: string | null;

  @ManyToOne(() => Media, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'avatar_media_id' })
  declare avatarMedia: Media | null;

  /** Direct-to-R2 uploaded banner (spec §29–32), same shape/ownership rules as `avatarMediaId`
   * — replaces `profileBannerUrl` for new writes; that column stays for existing rows. */
  @Column({ type: 'uuid', nullable: true })
  declare bannerMediaId: string | null;

  @ManyToOne(() => Media, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'banner_media_id' })
  declare bannerMedia: Media | null;

  @Column({ type: 'boolean', default: true })
  declare isLocal: boolean;

  @Column({ type: 'text', nullable: true })
  declare homeServer: string | null;

  /**
   * Nullable until federation: local actors only get a canonical URI once a stable
   * production domain exists (§21, §91) — never a temporary `*.fly.dev` address. Unique,
   * and PostgreSQL treats NULLs as distinct in a unique index, so any number of actors may
   * have none.
   */
  @Column({ type: 'text', nullable: true })
  declare canonicalUri: string | null;

  @Column({ type: 'text', nullable: true })
  declare inboxUri: string | null;

  @Column({ type: 'text', nullable: true })
  declare outboxUri: string | null;

  @Column({ type: 'text', nullable: true })
  declare federationState: string | null;

  /** SPKI PEM copied from `FederationKey`/the remote actor document's `publicKey.publicKeyPem`
   * (P8-005). Local actors carry their own; remote actors carry whatever their instance
   * published, refreshed on verification failure (`RemoteActorService`). */
  @Column({ type: 'text', nullable: true })
  declare publicKeyPem: string | null;

  /** AS2 `endpoints.sharedInbox` (P8-002/P8-004): remote-actor delivery prefers this over
   * `inboxUri` so one POST reaches every local follower on that instance instead of one per
   * actor. Null for local actors and for remote actors whose instance has no shared inbox. */
  @Column({ type: 'text', nullable: true })
  declare sharedInboxUri: string | null;

  /** Last time this remote actor's document was successfully (re)fetched (P8-002) — drives
   * `RemoteActorService`'s refetch-on-verification-failure/staleness policy. Null for local
   * actors and for a remote actor row created but not yet fetched. */
  @Column({ type: 'timestamptz', nullable: true })
  declare lastFetchedAt: Date | null;

  /**
   * Portability seam (§164), unused until v0.4: an actor with `movedToUri` set is read-only —
   * no new posts, no new follows accepted. A move is honored only when the destination actor
   * claims this one in its `alsoKnownAs`; a one-sided claim is never trusted.
   *
   * Naming note: `movedTo`/`alsoKnownAs` are Mastodon-originated community properties, not
   * standard ActivityStreams — these columns are ours, mapped only at the federation
   * boundary.
   */
  @Column({ type: 'text', nullable: true })
  declare movedToUri: string | null;

  /** Prior/alternate actor URIs this actor claims (§164). */
  @Column({ type: 'jsonb', nullable: true })
  declare alsoKnownAs: string[] | null;

  /**
   * Bounded (<= 2 KiB) inline identity presentation (§173), validated at write time against
   * the capabilities the node grants this user (§174). Badges inside it are server-attested
   * only — a user can never set badge text themselves.
   */
  @Column({ type: 'jsonb', nullable: true })
  declare nameplate: Record<string, unknown> | null;

  /**
   * The four rapid-personalization columns (owner request 2026-08-25) — real columns, not
   * more keys in the `nameplate` jsonb: a banner URL alone may be 2,048 chars, which cannot
   * coexist with §173's 2 KiB serialized-jsonb budget for the nameplate. All purely
   * cosmetic (§184.3); null = unset, which every client must render as "no customization".
   */
  @Column({ type: 'text', nullable: true })
  declare profileBannerUrl: string | null;

  /** Wire enum name of `ProfileFrame` without the prefix (`'BORDER'`), or null. */
  @Column({ type: 'varchar', length: 31, nullable: true })
  declare profileFrame: string | null;

  /** Wire enum name of `NameTagStyle` without the prefix (`'BADGE'`), or null. */
  @Column({ type: 'varchar', length: 31, nullable: true })
  declare nameTagStyle: string | null;

  /** `#RRGGBB`, or null. */
  @Column({ type: 'varchar', length: 31, nullable: true })
  declare accentColor: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  declare updatedAt: Date;

  /**
   * Tombstone (§25). A plain column, not `@DeleteDateColumn`, because deleted actors/posts
   * must still be *retrievable* (a deleted post renders as `[deleted]` in its thread) —
   * TypeORM's soft-delete column would silently filter them out of every `find()`, turning
   * "show the tombstone" into a bug you discover in production instead of an explicit
   * `WHERE deleted_at IS NULL` at each call site.
   */
  @Column({ type: 'timestamptz', nullable: true })
  declare deletedAt: Date | null;
}
