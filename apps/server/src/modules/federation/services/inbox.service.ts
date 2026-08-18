import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Actor, Follow, InboxActivity, Like, Post } from '@patches/database';
import { DataSource, type EntityManager } from 'typeorm';

import { AppConfigService } from '../../../config/app-config.service.js';
import { NotificationsService } from '../../notifications/notification.service.js';
import { buildActivity } from '../activitystreams/documents.js';
import {
  localActorUri,
  parseLocalActorUri,
  parseLocalPostUri,
  stripFragment,
} from '../activitystreams/uris.js';
import { verifyRequestSignature } from '../signatures/http-signature.js';
import { DeliveryService } from './delivery.service.js';
import { DomainBlockService } from './domain-block.service.js';
import { RemoteActorService } from './remote-actor.service.js';

export type InboxRejectionReason =
  'INVALID_SIGNATURE' | 'DOMAIN_BLOCKED' | 'ACTOR_MISMATCH' | 'MALFORMED_ACTIVITY';

export type InboxResult =
  { accepted: true; duplicate: boolean } | { accepted: false; reason: InboxRejectionReason };

export interface InboxRequestContext {
  method: string;
  /** Path + query, e.g. `/users/bob/inbox`. */
  target: string;
  headers: Readonly<Record<string, string>>;
  rawBody: Buffer;
}

/**
 * Processes one inbox POST end to end (P8-002/003/004/006): verifies the HTTP signature
 * (refetching the sender's key once on failure — P8-005), enforces the domain block list,
 * dedupes by activity id (P8-006), and dispatches `Follow`/`Undo`/`Accept`/`Create`/`Delete`/
 * `Like` (`docs/research/activitypub.md`).
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
    private readonly remoteActors: RemoteActorService,
    private readonly domainBlocks: DomainBlockService,
    private readonly delivery: DeliveryService,
    private readonly notifications: NotificationsService,
  ) {}

  async handle(ctx: InboxRequestContext): Promise<InboxResult> {
    let activity: Record<string, unknown>;
    try {
      activity = JSON.parse(ctx.rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      return { accepted: false, reason: 'MALFORMED_ACTIVITY' };
    }
    const activityId = activity.id;
    const activityType = activity.type;
    const activityActor = activity.actor;
    if (
      typeof activityId !== 'string' ||
      typeof activityType !== 'string' ||
      typeof activityActor !== 'string'
    ) {
      return { accepted: false, reason: 'MALFORMED_ACTIVITY' };
    }

    const sender = await this.verifySender(ctx, activityActor);
    if (sender === undefined) return { accepted: false, reason: 'INVALID_SIGNATURE' };
    if (activityActor !== sender.canonicalUri) return { accepted: false, reason: 'ACTOR_MISMATCH' };

    const senderDomain = sender.homeServer ?? '';
    const outcome = await this.dataSource.transaction(async (manager) => {
      if (await this.domainBlocks.isBlocked(manager, senderDomain)) {
        return { accepted: false as const, reason: 'DOMAIN_BLOCKED' as const };
      }

      const inserted = await this.tryRecordActivity(
        manager,
        activityId,
        activityType,
        activityActor,
      );
      if (!inserted) return { accepted: true as const, duplicate: true };

      const notify = await this.dispatch(manager, activityType, activity, sender);
      return { accepted: true as const, duplicate: false, notify };
    });

    if (outcome.accepted && !outcome.duplicate && outcome.notify !== undefined) {
      await outcome.notify();
    }
    return outcome.accepted
      ? { accepted: true, duplicate: outcome.duplicate }
      : { accepted: false, reason: outcome.reason };
  }

  /** Verifies the request's HTTP Signature against the sender's cached public key, refetching
   * the sender's actor document once (P8-005's "refetch on failure") if verification fails —
   * covers both a stale cached key (rotation) and a not-yet-cached remote actor. */
  private async verifySender(
    ctx: InboxRequestContext,
    activityActorUri: string,
  ): Promise<Actor | undefined> {
    const signatureHeader = ctx.headers.signature;
    if (signatureHeader === undefined) return undefined;
    const keyId = /keyId="([^"]+)"/.exec(signatureHeader)?.[1];
    if (keyId === undefined) return undefined;
    const signerUri = stripFragment(keyId);
    if (signerUri !== activityActorUri) return undefined;

    const attempt = async (forceRefetch: boolean): Promise<Actor | undefined> => {
      const sender = await this.dataSource.transaction((manager) =>
        this.remoteActors.getOrFetchByUri(manager, signerUri, { forceRefetch }),
      );
      if (sender.publicKeyPem === null) return undefined;
      const result = verifyRequestSignature({
        method: ctx.method,
        target: ctx.target,
        headers: ctx.headers,
        publicKeyPem: sender.publicKeyPem,
      });
      return result.ok ? sender : undefined;
    };

    const first = await attempt(false);
    if (first !== undefined) return first;
    try {
      return await attempt(true);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'inbox_signature_refetch_failed',
          signerUri,
          error: String(error),
        }),
      );
      return undefined;
    }
  }

  private async tryRecordActivity(
    manager: EntityManager,
    id: string,
    activityType: string,
    actorUri: string,
  ): Promise<boolean> {
    try {
      await manager
        .getRepository(InboxActivity)
        .save(manager.getRepository(InboxActivity).create({ id, activityType, actorUri }));
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  private async dispatch(
    manager: EntityManager,
    type: string,
    activity: Record<string, unknown>,
    sender: Actor,
  ): Promise<(() => Promise<void>) | undefined> {
    switch (type) {
      case 'Follow':
        return this.handleFollow(manager, activity, sender);
      case 'Undo':
        return this.handleUndo(manager, activity, sender);
      case 'Accept':
        return this.handleAccept(manager, activity, sender);
      case 'Create':
        return this.handleCreate(manager, activity, sender);
      case 'Delete':
        return this.handleDelete(manager, activity, sender);
      case 'Like':
        return this.handleLike(manager, activity, sender);
      default:
        this.logger.log(JSON.stringify({ event: 'inbox_activity_ignored', type }));
        return undefined;
    }
  }

  private async handleFollow(
    manager: EntityManager,
    activity: Record<string, unknown>,
    sender: Actor,
  ): Promise<(() => Promise<void>) | undefined> {
    const objectUri = objectUriOf(activity.object);
    if (objectUri === undefined) return undefined;
    const origin = this.config.publicOrigin;
    const handle = parseLocalActorUri(origin, objectUri);
    if (handle === undefined) return undefined;
    const followee = await manager
      .getRepository(Actor)
      .findOne({ where: { handleNormalized: handle } });
    if (followee === null || !followee.isLocal) return undefined;

    const follows = manager.getRepository(Follow);
    const existing = await follows.findOne({
      where: { followerActorId: sender.id, followeeActorId: followee.id },
    });
    if (existing === null) {
      try {
        await follows.save(
          follows.create({
            followerActorId: sender.id,
            followeeActorId: followee.id,
            status: 'FOLLOWING',
            acceptedAt: new Date(),
          }),
        );
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }

    const inboxUrl = sender.sharedInboxUri ?? sender.inboxUri;
    if (inboxUrl !== null && inboxUrl !== undefined) {
      const accept = buildActivity({
        id: `${origin}/activities/${randomUUID()}`,
        type: 'Accept',
        actor: localActorUri(origin, followee.handleNormalized),
        object: activity,
      });
      await this.delivery.enqueue(manager, {
        actorId: followee.id,
        activity: accept,
        inboxUrls: [inboxUrl],
      });
    }
    return () => this.notifications.notifyFollow(followee.id, sender.id);
  }

  private async handleUndo(
    manager: EntityManager,
    activity: Record<string, unknown>,
    sender: Actor,
  ): Promise<undefined> {
    const inner = activity.object;
    if (typeof inner !== 'object' || inner === null) return undefined;
    const innerRecord = inner as Record<string, unknown>;
    const innerType = innerRecord.type;

    if (innerType === 'Follow') {
      const objectUri = objectUriOf(innerRecord.object);
      const handle =
        objectUri === undefined
          ? undefined
          : parseLocalActorUri(this.config.publicOrigin, objectUri);
      if (handle === undefined) return undefined;
      const followee = await manager
        .getRepository(Actor)
        .findOne({ where: { handleNormalized: handle } });
      if (followee === null) return undefined;
      await manager
        .getRepository(Follow)
        .delete({ followerActorId: sender.id, followeeActorId: followee.id });
      return undefined;
    }

    if (innerType === 'Like') {
      const objectUri = objectUriOf(innerRecord.object);
      const postId =
        objectUri === undefined
          ? undefined
          : parseLocalPostUri(this.config.publicOrigin, objectUri);
      if (postId === undefined) return undefined;
      await manager.getRepository(Like).delete({ actorId: sender.id, postId });
    }
    return undefined;
  }

  private async handleAccept(
    manager: EntityManager,
    activity: Record<string, unknown>,
    sender: Actor,
  ): Promise<undefined> {
    const inner = activity.object;
    const innerRecord =
      typeof inner === 'object' && inner !== null ? (inner as Record<string, unknown>) : undefined;
    const followerUri = innerRecord === undefined ? undefined : objectUriOf(innerRecord.actor);
    if (followerUri === undefined) return undefined;
    const handle = parseLocalActorUri(this.config.publicOrigin, followerUri);
    if (handle === undefined) return undefined;
    const follower = await manager
      .getRepository(Actor)
      .findOne({ where: { handleNormalized: handle } });
    if (follower === null) return undefined;

    await manager
      .getRepository(Follow)
      .createQueryBuilder()
      .update(Follow)
      .set({ status: 'FOLLOWING', acceptedAt: new Date() })
      .where('follower_actor_id = :followerId', { followerId: follower.id })
      .andWhere('followee_actor_id = :followeeId', { followeeId: sender.id })
      .execute();
    return undefined;
  }

  private async handleCreate(
    manager: EntityManager,
    activity: Record<string, unknown>,
    sender: Actor,
  ): Promise<undefined> {
    const object = activity.object;
    if (typeof object !== 'object' || object === null) return undefined;
    const note = object as Record<string, unknown>;
    if (note.type !== 'Note') return undefined;
    const noteId = note.id;
    const content = note.content;
    if (typeof noteId !== 'string' || typeof content !== 'string') return undefined;

    const origin = this.config.publicOrigin;
    const inReplyToRaw = note.inReplyTo;
    let inReplyToId: string | null = null;
    let rootPostId: string | undefined;
    if (typeof inReplyToRaw === 'string') {
      const localParentId = parseLocalPostUri(origin, inReplyToRaw);
      const parent = await (localParentId !== undefined
        ? manager.getRepository(Post).findOne({ where: { id: localParentId } })
        : manager.getRepository(Post).findOne({ where: { canonicalUri: inReplyToRaw } }));
      if (parent !== null) {
        inReplyToId = parent.id;
        rootPostId = parent.rootPostId;
      }
    }

    const id = randomUUID();
    const posts = manager.getRepository(Post);
    try {
      await posts.save(
        posts.create({
          id,
          authorActorId: sender.id,
          body: content.slice(0, 5000),
          postType: 'NOTE',
          visibility: 'PUBLIC',
          inReplyToId,
          rootPostId: rootPostId ?? id,
          isLocal: false,
          canonicalUri: noteId,
          originServer: sender.homeServer,
          clientRequestId: null,
        }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    return undefined;
  }

  private async handleDelete(
    manager: EntityManager,
    activity: Record<string, unknown>,
    sender: Actor,
  ): Promise<undefined> {
    const objectUri = objectUriOf(activity.object);
    if (objectUri === undefined) return undefined;
    const post = await manager.getRepository(Post).findOne({ where: { canonicalUri: objectUri } });
    if (post === null || post.authorActorId !== sender.id || post.deletedAt !== null)
      return undefined;
    await manager.getRepository(Post).update({ id: post.id }, { deletedAt: new Date() });
    return undefined;
  }

  private async handleLike(
    manager: EntityManager,
    activity: Record<string, unknown>,
    sender: Actor,
  ): Promise<(() => Promise<void>) | undefined> {
    const objectUri = objectUriOf(activity.object);
    const postId =
      objectUri === undefined ? undefined : parseLocalPostUri(this.config.publicOrigin, objectUri);
    if (postId === undefined) return undefined;
    const post = await manager.getRepository(Post).findOne({ where: { id: postId } });
    if (post === null || post.deletedAt !== null) return undefined;

    const likes = manager.getRepository(Like);
    const existing = await likes.findOne({ where: { actorId: sender.id, postId } });
    if (existing !== null) return undefined;
    try {
      await likes.save(likes.create({ actorId: sender.id, postId }));
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return undefined;
    }
    return () => this.notifications.notifyLike(post.authorActorId, sender.id, postId);
  }
}

/** AS2 `object`/`actor` properties may be a bare URI string or an embedded object with an
 * `id` — this node accepts either. */
function objectUriOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const id = (value as Record<string, unknown>).id;
    if (typeof id === 'string') return id;
  }
  return undefined;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
