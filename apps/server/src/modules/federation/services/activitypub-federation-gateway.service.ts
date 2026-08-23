import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Actor, Follow, Post, Repost } from '@patches/database';
import type { EntityManager } from 'typeorm';

import { AppConfigService } from '../../../config/app-config.service.js';
import { localRepostAnnounceUri } from '../activity-ids.js';
import { buildActivity, buildNoteObject, buildTombstone } from '../activitystreams/documents.js';
import type { FederationGateway } from '../federation-gateway.js';
import { localActorFollowersUri, localActorUri, localPostUri } from '../activitystreams/uris.js';
import { DeliveryService } from './delivery.service.js';
import { DomainBlockService } from './domain-block.service.js';
import { KeyService } from './key.service.js';

/**
 * `FederationGateway` real implementation (P8-003), selected instead of `NoopFederationGateway`
 * when `FEDERATION_ENABLED=true` (`federation.module.ts`). Every method resolves the
 * recipients, builds the AS2 activity, and hands it to `DeliveryService` — never performs
 * network I/O itself, which is `FederationDeliverHandler`'s (`apps/worker`) job once the job
 * is claimed.
 *
 * P14-013 (spec §201.5) closes the outbound recipient-resolution gap `DomainBlockService`'s
 * own doc comment used to flag: every recipient this gateway resolves — remote followers
 * (`remoteFollowerInboxes`), a `Follow`/`Undo Follow` target (`loadPair`), a `Like`/`Undo
 * Like` target (`buildLikeUndoLike`), and a repost's `Announce`/`Undo(Announce)` target
 * (`buildAnnounceUndoAnnounce`, ADR 0028 §4) — is now checked against `domain_blocks`
 * *before* an inbox URL is ever handed to `DeliveryService.enqueue`, not only at
 * `DeliveryService`'s own pre-delivery check (`delivery.service.ts`'s `filterBlockedInboxes`,
 * still kept as a second, independent check — belt and suspenders, not a replacement for
 * either half).
 */
@Injectable()
export class ActivityPubFederationGateway implements FederationGateway {
  constructor(
    private readonly config: AppConfigService,
    private readonly delivery: DeliveryService,
    private readonly keys: KeyService,
    private readonly domainBlocks: DomainBlockService,
  ) {}

  async publishPost(manager: EntityManager, postId: string): Promise<void> {
    const post = await manager
      .getRepository(Post)
      .findOne({ where: { id: postId }, relations: { authorActor: true } });
    if (post === null || !post.isLocal || post.visibility !== 'PUBLIC') return;

    const origin = this.config.publicOrigin;
    const author = post.authorActor;
    const inboxUrls = await this.remoteFollowerInboxes(manager, author.id);
    if (inboxUrls.length === 0) return;
    await this.keys.getOrCreateKeyPair(manager, author.id);

    const actorUri = localActorUri(origin, author.handleNormalized);
    const inReplyTo = await this.federatedUriForPost(manager, post.inReplyToId);
    const note = buildNoteObject({
      id: localPostUri(origin, post.id),
      attributedTo: actorUri,
      content: post.body ?? '',
      published: post.createdAt,
      inReplyTo: inReplyTo ?? null,
      followersUri: localActorFollowersUri(origin, author.handleNormalized),
    });
    const activity = buildActivity({
      id: `${origin}/activities/${randomUUID()}`,
      type: 'Create',
      actor: actorUri,
      object: note,
    });

    await this.delivery.enqueue(manager, { actorId: author.id, activity, inboxUrls });
  }

  async publishDelete(manager: EntityManager, postId: string): Promise<void> {
    const post = await manager
      .getRepository(Post)
      .findOne({ where: { id: postId }, relations: { authorActor: true } });
    if (post === null || !post.isLocal) return;

    const origin = this.config.publicOrigin;
    const author = post.authorActor;
    const inboxUrls = await this.remoteFollowerInboxes(manager, author.id);
    if (inboxUrls.length === 0) return;
    await this.keys.getOrCreateKeyPair(manager, author.id);

    const activity = buildActivity({
      id: `${origin}/activities/${randomUUID()}`,
      type: 'Delete',
      actor: localActorUri(origin, author.handleNormalized),
      object: buildTombstone(localPostUri(origin, post.id)),
    });
    await this.delivery.enqueue(manager, { actorId: author.id, activity, inboxUrls });
  }

  async followRemoteActor(
    manager: EntityManager,
    followerActorId: string,
    targetActorId: string,
  ): Promise<void> {
    const { follower, target, inboxUrl } = await this.loadPair(
      manager,
      followerActorId,
      targetActorId,
    );
    if (inboxUrl === undefined) return;
    await this.keys.getOrCreateKeyPair(manager, follower.id);

    const origin = this.config.publicOrigin;
    const activity = buildActivity({
      id: `${origin}/activities/${randomUUID()}`,
      type: 'Follow',
      actor: localActorUri(origin, follower.handleNormalized),
      object: target.canonicalUri ?? '',
    });
    await this.delivery.enqueue(manager, {
      actorId: follower.id,
      activity,
      inboxUrls: [inboxUrl],
    });
  }

  async unfollowRemoteActor(
    manager: EntityManager,
    followerActorId: string,
    targetActorId: string,
  ): Promise<void> {
    const { follower, target, inboxUrl } = await this.loadPair(
      manager,
      followerActorId,
      targetActorId,
    );
    if (inboxUrl === undefined) return;
    await this.keys.getOrCreateKeyPair(manager, follower.id);

    const origin = this.config.publicOrigin;
    const followActorUri = localActorUri(origin, follower.handleNormalized);
    const undo = buildActivity({
      id: `${origin}/activities/${randomUUID()}`,
      type: 'Undo',
      actor: followActorUri,
      object: buildActivity({
        id: `${origin}/activities/${randomUUID()}`,
        type: 'Follow',
        actor: followActorUri,
        object: target.canonicalUri ?? '',
      }),
    });
    await this.delivery.enqueue(manager, {
      actorId: follower.id,
      activity: undo,
      inboxUrls: [inboxUrl],
    });
  }

  async likeRemotePost(manager: EntityManager, actorId: string, postId: string): Promise<void> {
    const activity = await this.buildLikeUndoLike(manager, actorId, postId, 'Like');
    if (activity === undefined) return;
    await this.delivery.enqueue(manager, {
      actorId,
      activity: activity.activity,
      inboxUrls: [activity.inboxUrl],
    });
  }

  async unlikeRemotePost(manager: EntityManager, actorId: string, postId: string): Promise<void> {
    const built = await this.buildLikeUndoLike(manager, actorId, postId, 'Like');
    if (built === undefined) return;
    const origin = this.config.publicOrigin;
    const undo = buildActivity({
      id: `${origin}/activities/${randomUUID()}`,
      type: 'Undo',
      actor: built.activity.actor as string,
      object: built.activity,
    });
    await this.delivery.enqueue(manager, { actorId, activity: undo, inboxUrls: [built.inboxUrl] });
  }

  async announceRemotePost(manager: EntityManager, repostId: string): Promise<void> {
    const built = await this.buildAnnounceUndoAnnounce(manager, repostId);
    if (built === undefined) return;
    await this.delivery.enqueue(manager, {
      actorId: built.actorId,
      activity: built.activity,
      inboxUrls: [built.inboxUrl],
    });
  }

  async unannounceRemotePost(manager: EntityManager, repostId: string): Promise<void> {
    const built = await this.buildAnnounceUndoAnnounce(manager, repostId);
    if (built === undefined) return;
    const origin = this.config.publicOrigin;
    // The outer Undo wrapper's own id may be one-shot random — what must be stable (ADR 0028
    // §4) is the *object*: exactly the deterministic Announce document, so a peer matches
    // this undo to the announce it already recorded. Never a fresh inner-activity id (the
    // B-079 flaw unfollow/unlike still carry).
    const undo = buildActivity({
      id: `${origin}/activities/${randomUUID()}`,
      type: 'Undo',
      actor: built.activity.actor as string,
      object: built.activity,
    });
    await this.delivery.enqueue(manager, {
      actorId: built.actorId,
      activity: undo,
      inboxUrls: [built.inboxUrl],
    });
  }

  // ---------------------------------------------------------------- internals

  private async buildLikeUndoLike(
    manager: EntityManager,
    actorId: string,
    postId: string,
    type: 'Like',
  ): Promise<{ activity: ReturnType<typeof buildActivity>; inboxUrl: string } | undefined> {
    const [liker, post] = await Promise.all([
      manager.getRepository(Actor).findOne({ where: { id: actorId } }),
      manager
        .getRepository(Post)
        .findOne({ where: { id: postId }, relations: { authorActor: true } }),
    ]);
    if (liker === null || post === null || post.isLocal) return undefined;
    const targetInbox = post.authorActor.sharedInboxUri ?? post.authorActor.inboxUri;
    if (targetInbox === null || post.canonicalUri === null) return undefined;
    if (await this.isActorDomainBlocked(manager, post.authorActor)) return undefined;
    await this.keys.getOrCreateKeyPair(manager, liker.id);

    const origin = this.config.publicOrigin;
    const activity = buildActivity({
      id: `${origin}/activities/${randomUUID()}`,
      type,
      actor: localActorUri(origin, liker.handleNormalized),
      object: post.canonicalUri,
    });
    return { activity, inboxUrl: targetInbox };
  }

  /** Builds the deterministic `Announce` for one repost row — shared by `announceRemotePost`
   * and `unannounceRemotePost` so the Undo names byte-for-byte the same document (same
   * activity id included) the peer may already have seen. The id comes from
   * `localRepostAnnounceUri` over `reposts.id`, never `randomUUID()` (ADR 0028 §4), so it is
   * stable across delivery retries and identical on every reconstruction. Gates mirror the
   * Like path plus `publishPost`'s visibility gate: the row must exist, the post must be a
   * remote PUBLIC post with a canonical URI, its author reachable and not domain-blocked. */
  private async buildAnnounceUndoAnnounce(
    manager: EntityManager,
    repostId: string,
  ): Promise<
    | {
        activity: ReturnType<typeof buildActivity>;
        inboxUrl: string;
        actorId: string;
      }
    | undefined
  > {
    const repost = await manager.getRepository(Repost).findOne({
      where: { id: repostId },
      relations: { actor: true, post: { authorActor: true } },
    });
    if (repost === null) return undefined;
    const post = repost.post;
    // Remote-only (a local author has no remote inbox to deliver to — mirror the Like path),
    // PUBLIC-only (mirror `publishPost`'s visibility gate), and only when the post has a
    // federated identity to announce.
    if (post.isLocal || post.visibility !== 'PUBLIC' || post.canonicalUri === null) {
      return undefined;
    }
    const targetInbox = post.authorActor.sharedInboxUri ?? post.authorActor.inboxUri;
    if (targetInbox === null) return undefined;
    if (await this.isActorDomainBlocked(manager, post.authorActor)) return undefined;
    await this.keys.getOrCreateKeyPair(manager, repost.actor.id);

    const origin = this.config.publicOrigin;
    const activity = buildActivity({
      id: localRepostAnnounceUri(origin, repost.id),
      type: 'Announce',
      actor: localActorUri(origin, repost.actor.handleNormalized),
      object: post.canonicalUri,
    });
    return { activity, inboxUrl: targetInbox, actorId: repost.actorId };
  }

  private async loadPair(
    manager: EntityManager,
    followerActorId: string,
    targetActorId: string,
  ): Promise<{ follower: Actor; target: Actor; inboxUrl: string | undefined }> {
    const actors = manager.getRepository(Actor);
    const [follower, target] = await Promise.all([
      actors.findOneOrFail({ where: { id: followerActorId } }),
      actors.findOneOrFail({ where: { id: targetActorId } }),
    ]);
    const targetBlocked = !target.isLocal && (await this.isActorDomainBlocked(manager, target));
    const inboxUrl =
      target.isLocal || targetBlocked
        ? undefined
        : (target.sharedInboxUri ?? target.inboxUri ?? undefined);
    return { follower, target, inboxUrl };
  }

  /** Remote followers' inbox URLs for a local actor, shared-inbox-deduped (P8-004: "shared
   * inbox dedupe"), excluding any follower whose home server is in `domain_blocks` (P14-013,
   * spec §201.5) — a blocked domain's actor is dropped here, before an inbox URL is ever
   * built, not only at `DeliveryService`'s later pre-delivery check. */
  private async remoteFollowerInboxes(
    manager: EntityManager,
    followeeActorId: string,
  ): Promise<string[]> {
    const rows = await manager
      .getRepository(Follow)
      .createQueryBuilder('follow')
      .innerJoinAndSelect('follow.followerActor', 'follower')
      .where('follow.followeeActorId = :followeeActorId', { followeeActorId })
      .andWhere('follower.isLocal = false')
      .getMany();

    const blockedCache = new Map<string, boolean>();
    const inboxes: string[] = [];
    for (const row of rows) {
      const follower = row.followerActor;
      const domain = follower.homeServer;
      if (domain !== null) {
        let blocked = blockedCache.get(domain);
        if (blocked === undefined) {
          blocked = await this.domainBlocks.isBlocked(manager, domain);
          blockedCache.set(domain, blocked);
        }
        if (blocked) continue;
      }
      const inbox = follower.sharedInboxUri ?? follower.inboxUri;
      if (inbox !== null) inboxes.push(inbox);
    }
    return [...new Set(inboxes)];
  }

  /** `false` for a remote actor with no `homeServer` on file — that shouldn't happen in
   * practice (every remote actor upsert sets it), but an unknown domain is never treated as
   * blocked purely by absence; `DeliveryService`'s own pre-delivery check still applies to
   * whatever inbox URL this resolves to either way. */
  private async isActorDomainBlocked(manager: EntityManager, actor: Actor): Promise<boolean> {
    if (actor.homeServer === null) return false;
    return this.domainBlocks.isBlocked(manager, actor.homeServer);
  }

  /** Resolves `inReplyToId`'s federated object URI: the fast local path (no DB hit) if the
   * parent is local, otherwise the parent's cached `canonical_uri`. `undefined` for a root
   * post or an in-reply-to whose parent has no federated identity yet. */
  private async federatedUriForPost(
    manager: EntityManager,
    inReplyToId: string | null,
  ): Promise<string | undefined> {
    if (inReplyToId === null) return undefined;
    const parent = await manager.getRepository(Post).findOne({ where: { id: inReplyToId } });
    if (parent === null) return undefined;
    if (parent.isLocal) return localPostUri(this.config.publicOrigin, parent.id);
    return parent.canonicalUri ?? undefined;
  }
}
