import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Actor } from './actor.entity.js';

/**
 * Per-actor discoverability and privacy-notice acknowledgement (`INITIAL_VISION.md` §197.5,
 * §197.1). One row per actor — `actorId` is the PK, no surrogate id, same shape as
 * `ActorFlair`/`FederationKey`. Defaults are all `true` except `locked` (§197.5: "no
 * behaviour change for an actor who ignores them").
 *
 * `privacyNoticeVersion`/`privacyNoticeAcknowledgedAt` are nullable together: an actor who has
 * never acknowledged any notice version has neither set. A material notice change increments
 * the node's published version and every client must show the new summary and record a fresh
 * acknowledgement (§197.1) — this row only ever holds the *most recent* acknowledgement, not
 * a history of them.
 */
@Entity({ name: 'actor_privacy_prefs' })
export class ActorPrivacyPrefs {
  @PrimaryColumn({ type: 'uuid' })
  declare actorId: string;

  @OneToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  /** In actor search results and any node directory. Exact-handle resolution
   * (`GetActorByHandle`, `ResolveActor`) always works regardless of this setting. */
  @Column({ type: 'boolean', default: true })
  declare discoverable: boolean;

  /** In full-text post search (`PostService.SearchPosts`). */
  @Column({ type: 'boolean', default: true })
  declare indexable: boolean;

  /** Public posts appear on the node's local timeline. Local-only; not privacy — the posts
   * are still public. */
  @Column({ type: 'boolean', default: true })
  declare showInLocalFeed: boolean;

  /** Follows require the actor's approval (follow requests, §197.5). Never auto-accepted. */
  @Column({ type: 'boolean', default: false })
  declare locked: boolean;

  /** Null until the actor has acknowledged any privacy notice. */
  @Column({ type: 'integer', nullable: true })
  declare privacyNoticeVersion: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  declare privacyNoticeAcknowledgedAt: Date | null;
}
