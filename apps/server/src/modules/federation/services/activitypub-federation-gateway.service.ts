import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Actor, Follow, Post } from '@patches/database';
import type { EntityManager } from 'typeorm';

import { AppConfigService } from '../../../config/app-config.service.js';
import { buildActivity, buildNoteObject, buildTombstone } from '../activitystreams/documents.js';
import type { FederationGateway } from '../federation-gateway.js';
import { localActorFollowersUri, localActorUri, localPostUri } from '../activitystreams/uris.js';
import { DeliveryService } from './delivery.service.js';
import { KeyService } from './key.service.js';

/**
 * `FederationGateway` real implementation (P8-003), selected instead of `NoopFederationGateway`
 * when `FEDERATION_ENABLED=true` (`federation.module.ts`). Every method resolves the
 * recipients, builds the AS2 activity, and hands it to `DeliveryService` — never performs
 * network I/O itself, which is `FederationDeliverHandler`'s (`apps/worker`) job once the job
 * is claimed.
 */
@Injectable()
export class ActivityPubFederationGateway implements FederationGateway {
  constructor(
    private readonly config: AppConfigService,
    private readonly delivery: DeliveryService,
    private readonly keys: KeyService,
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
    const inboxUrl = target.isLocal
      ? undefined
      : (target.sharedInboxUri ?? target.inboxUri ?? undefined);
    return { follower, target, inboxUrl };
  }

  /** Remote followers' inbox URLs for a local actor, shared-inbox-deduped (P8-004: "shared
   * inbox dedupe"). */
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
    const inboxes = rows
      .map((row) => row.followerActor.sharedInboxUri ?? row.followerActor.inboxUri)
      .filter((inbox): inbox is string => inbox !== null);
    return [...new Set(inboxes)];
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
