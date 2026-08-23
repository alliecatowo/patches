import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Actor,
  Block,
  Follow,
  InboxActivity,
  Like,
  Mute,
  Post,
  PostTag,
  Repost,
  Tag,
} from '@patches/database';
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
import { FederationMetricsService } from '../federation-metrics.service.js';
import { PeerRateLimiterService } from '../security/peer-rate-limiter.service.js';
import { safeFetch } from '../security/safe-fetch.js';
import { parseBoundedJson } from '../security/bounded-json.js';
import { verifyDigestHeader } from '../signatures/digest.js';
import { verifyRequestSignature } from '../signatures/http-signature.js';
import { DeliveryService } from './delivery.service.js';
import { DomainBlockService } from './domain-block.service.js';
import { KeyService } from './key.service.js';
import { RemoteActorService } from './remote-actor.service.js';
import { TagExtractionService } from '../../../modules/tags/tag-extraction.service.js';
import { normalizeTagIdentity } from '../../../modules/tags/tag-grammar.js';

/** AS2 actor object types an `Update` may target (`docs/research/activitypub.md`) — anything
 * else in `object.type` is neither a `Note` nor an actor this node knows how to refresh, so
 * it's ignored like any other unrecognized shape. */
const AS2_ACTOR_TYPES = new Set(['Person', 'Service', 'Group', 'Organization', 'Application']);

export type InboxRejectionReason =
  'INVALID_SIGNATURE' | 'DOMAIN_BLOCKED' | 'ACTOR_MISMATCH' | 'MALFORMED_ACTIVITY' | 'RATE_LIMITED';

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
 * dedupes by activity id (P8-006), and dispatches `Follow`/`Undo`/`Accept`/`Create`/`Update`/
 * `Delete`/`Like` (`docs/research/activitypub.md`).
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
    private readonly keys: KeyService,
    private readonly metrics: FederationMetricsService,
    private readonly rateLimiter: PeerRateLimiterService,
    private readonly tagExtraction: TagExtractionService,
  ) {}

  async handle(ctx: InboxRequestContext): Promise<InboxResult> {
    this.metrics.increment('inbox_received');
    const digestHeader = ctx.headers.digest;
    if (digestHeader === undefined || !verifyDigestHeader(digestHeader, ctx.rawBody)) {
      this.metrics.increment('inbox_rejected_signature');
      return { accepted: false, reason: 'INVALID_SIGNATURE' };
    }

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
    if (sender === undefined) {
      this.metrics.increment('inbox_rejected_signature');
      return { accepted: false, reason: 'INVALID_SIGNATURE' };
    }
    if (activityActor !== sender.canonicalUri) return { accepted: false, reason: 'ACTOR_MISMATCH' };

    let senderOrigin: string;
    try {
      senderOrigin = new URL(sender.canonicalUri).origin;
    } catch {
      return { accepted: false, reason: 'INVALID_SIGNATURE' };
    }
    if (!this.rateLimiter.consumeVerifiedOrigin(senderOrigin)) {
      // The aggregate counter is useful to operators without adding a per-origin registry key.
      this.metrics.increment('inbox_rejected_ratelimit');
      return { accepted: false, reason: 'RATE_LIMITED' };
    }

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
    const labels = { type, domain: sender.homeServer ?? undefined };
    switch (type) {
      case 'Follow':
        this.metrics.increment('inbox_handled', labels);
        return this.handleFollow(manager, activity, sender);
      case 'Undo':
        this.metrics.increment('inbox_handled', labels);
        return this.handleUndo(manager, activity, sender);
      case 'Accept':
        this.metrics.increment('inbox_handled', labels);
        return this.handleAccept(manager, activity, sender);
      case 'Create':
        this.metrics.increment('inbox_handled', labels);
        return this.handleCreate(manager, activity, sender);
      case 'Update':
        this.metrics.increment('inbox_handled', labels);
        return this.handleUpdate(manager, activity, sender);
      case 'Delete':
        this.metrics.increment('inbox_handled', labels);
        return this.handleDelete(manager, activity, sender);
      case 'Like':
        this.metrics.increment('inbox_handled', labels);
        return this.handleLike(manager, activity, sender);
      case 'Announce':
        this.metrics.increment('inbox_handled', labels);
        return this.handleAnnounce(manager, activity, sender);
      default:
        this.metrics.increment('inbox_ignored', labels);
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
      await this.keys.getOrCreateKeyPair(manager, followee.id);
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

    if (innerType === 'Announce') {
      return this.handleUndoAnnounce(manager, innerRecord, sender);
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
          body: sanitizeNoteContent(content),
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

  /**
   * `Update` (A-035, spec §160's "Update semantics decided"): dispatches on `object.type` — a
   * `Note` update edits the matching local `Post` row created by `handleCreate`; an actor
   * update (`Person`/`Service`/...) refreshes this node's cached copy of the sender's own
   * profile. Anything else is silently ignored, same posture as every other unrecognized
   * shape in this file.
   */
  private async handleUpdate(
    manager: EntityManager,
    activity: Record<string, unknown>,
    sender: Actor,
  ): Promise<undefined> {
    const object = activity.object;
    if (typeof object !== 'object' || object === null) return undefined;
    const objectRecord = object as Record<string, unknown>;

    if (objectRecord.type === 'Note') return this.handleUpdateNote(manager, objectRecord, sender);
    if (typeof objectRecord.type === 'string' && AS2_ACTOR_TYPES.has(objectRecord.type)) {
      return this.handleUpdateActor(manager, objectRecord, sender);
    }
    return undefined;
  }

  /** Only the note's own author may edit it (mirrors `handleDelete`'s ownership check) — an
   * `Update(Note)` from anyone else, or for a note this node never ingested via `Create`, or
   * for one already tombstoned, is a no-op rather than an error. */
  private async handleUpdateNote(
    manager: EntityManager,
    note: Record<string, unknown>,
    sender: Actor,
  ): Promise<undefined> {
    const noteId = note.id;
    const content = note.content;
    if (typeof noteId !== 'string' || typeof content !== 'string') return undefined;

    const post = await manager.getRepository(Post).findOne({ where: { canonicalUri: noteId } });
    if (post === null || post.authorActorId !== sender.id || post.deletedAt !== null) {
      return undefined;
    }
    await manager
      .getRepository(Post)
      .update({ id: post.id }, { body: sanitizeNoteContent(content), editedAt: new Date() });
    return undefined;
  }

  /**
   * Refreshes this node's cached copy of the *sending* actor only — `object.id` must equal
   * `sender.canonicalUri` exactly. A remote peer could otherwise use its own valid signature
   * to push a poisoned `Update(Person)` claiming to describe some other actor entirely (e.g.
   * to rewrite a third party's cached public key); this node never trusts an `Update`'s object
   * for anyone but its own signer. Re-fetches through `RemoteActorService.getOrFetchByUri`
   * (`forceRefetch: true`) rather than trusting the embedded object's fields directly, so the
   * refreshed copy is what the remote actor's *own* document currently says, not whatever this
   * `Update` activity happened to carry.
   */
  private async handleUpdateActor(
    manager: EntityManager,
    object: Record<string, unknown>,
    sender: Actor,
  ): Promise<undefined> {
    const objectId = object.id;
    const senderUri = sender.canonicalUri;
    if (typeof objectId !== 'string' || senderUri === null || objectId !== senderUri) {
      return undefined;
    }
    await this.remoteActors.getOrFetchByUri(manager, senderUri, { forceRefetch: true });
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

  private async handleAnnounce(
    manager: EntityManager,
    activity: Record<string, unknown>,
    sender: Actor,
  ): Promise<undefined> {
    if (activity.type !== 'Announce') return undefined;

    const objectUri = objectUriOf(activity.object);
    if (objectUri === undefined) return undefined;

    const isLocal = objectUri.startsWith(this.config.publicOrigin);
    if (isLocal) return undefined;

    const post = await this.fetchRemotePost(manager, objectUri);
    if (post === null) return undefined;

    if (post.visibility !== 'PUBLIC' || post.deletedAt !== null) return undefined;

    if (!post.isLocal) {
      const postAuthor = await manager
        .getRepository(Actor)
        .findOne({ where: { id: post.authorActorId } });
      if (postAuthor !== null && (await this.isBlockedOrMutedBy(manager, postAuthor, sender))) {
        return undefined;
      }
    }

    const announceId = activity.id;
    if (typeof announceId !== 'string') return undefined;

    const repostRepo = manager.getRepository(Repost);
    const existingRepost = await repostRepo.findOne({
      where: { actorId: sender.id, postId: post.id },
    });
    if (existingRepost !== null) return undefined;

    const repost = repostRepo.create({
      actorId: sender.id,
      postId: post.id,
      remoteActivityUri: announceId,
    });

    try {
      await repostRepo.save(repost);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return undefined;
    }

    if (Array.isArray(activity.tag) && activity.tag.length > 0) {
      await this.ingestAnnounceTags(manager, post.id, activity.tag);
    }

    return undefined;
  }

  private async handleUndoAnnounce(
    manager: EntityManager,
    innerActivity: Record<string, unknown>,
    sender: Actor,
  ): Promise<undefined> {
    const announceId = innerActivity.id;
    if (typeof announceId !== 'string') return undefined;

    const repost = await manager.getRepository(Repost).findOne({
      where: { remoteActivityUri: announceId },
      relations: { actor: true },
    });
    if (repost === null) return undefined;

    if (repost.actorId !== sender.id) return undefined;

    await manager.getRepository(Repost).delete({ id: repost.id });
    return undefined;
  }

  private async isBlockedOrMutedBy(
    manager: EntityManager,
    postAuthor: Actor,
    sender: Actor,
  ): Promise<boolean> {
    const block = await manager.getRepository(Block).findOne({
      where: { blockerActorId: postAuthor.id, blockedActorId: sender.id },
    });
    if (block !== null) return true;

    const mute = await manager.getRepository(Mute).findOne({
      where: { muterActorId: postAuthor.id, mutedActorId: sender.id },
    });
    if (mute !== null) return true;

    return false;
  }

  private async fetchRemotePost(manager: EntityManager, objectUri: string): Promise<Post | null> {
    const existing = await manager.getRepository(Post).findOne({
      where: { canonicalUri: objectUri },
    });
    if (existing !== null) return existing;

    const policy = {
      allowHttp: !this.config.isProduction,
      allowPrivateNetworks: !this.config.isProduction,
    };
    let response;
    try {
      response = await safeFetch(objectUri, {
        headers: { accept: 'application/activity+json, application/ld+json;q=0.9' },
        policy,
        maxBytes: 1024 * 1024,
      });
    } catch {
      return null;
    }

    if (response.status !== 200) return null;

    const contentType = response.headers['content-type'];
    const contentTypeStr = Array.isArray(contentType) ? contentType[0] : contentType;
    if (
      contentTypeStr === undefined ||
      (!contentTypeStr.includes('activity+json') && !contentTypeStr.includes('ld+json'))
    ) {
      return null;
    }

    let activityDoc: Record<string, unknown>;
    try {
      activityDoc = parseBoundedJson(response.body.toString('utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }

    if (activityDoc.type !== 'Note' && activityDoc.type !== 'Article') return null;

    const noteId = activityDoc.id;
    const content = activityDoc.content;
    const attributedTo = activityDoc.attributedTo;
    if (
      typeof noteId !== 'string' ||
      typeof content !== 'string' ||
      typeof attributedTo !== 'string'
    ) {
      return null;
    }

    const authorActor = await this.remoteActors.getOrFetchByUri(manager, attributedTo);
    if (authorActor === null) return null;

    const inReplyToRaw = activityDoc.inReplyTo;
    let inReplyToId: string | null = null;
    let rootPostId: string | undefined;
    if (typeof inReplyToRaw === 'string') {
      const localParentId = parseLocalPostUri(this.config.publicOrigin, inReplyToRaw);
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
          authorActorId: authorActor.id,
          body: sanitizeNoteContent(content),
          postType: 'NOTE',
          visibility: 'PUBLIC',
          inReplyToId,
          rootPostId: rootPostId ?? id,
          isLocal: false,
          canonicalUri: noteId,
          originServer: authorActor.homeServer,
          clientRequestId: null,
        }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return manager.getRepository(Post).findOne({ where: { canonicalUri: noteId } });
    }

    return manager.getRepository(Post).findOne({ where: { id } });
  }

  private async ingestAnnounceTags(
    manager: EntityManager,
    postId: string,
    tagArray: unknown[],
  ): Promise<void> {
    const postTagsRepo = manager.getRepository(PostTag);
    const tagRepo = manager.getRepository(Tag);

    for (const tagItem of tagArray) {
      if (typeof tagItem !== 'object' || tagItem === null) continue;
      const tagRecord = tagItem as Record<string, unknown>;
      if (tagRecord.type !== 'Hashtag') continue;

      const name = tagRecord.name;
      if (typeof name !== 'string') continue;

      const normalizedName = normalizeTagIdentity(name);
      if (normalizedName.length === 0 || normalizedName.length > 30) continue;

      let tag = await tagRepo.findOne({ where: { name: normalizedName } });
      if (tag === null) {
        const displayName =
          typeof tagRecord.displayName === 'string' ? tagRecord.displayName : name;
        try {
          tag = await tagRepo.save(tagRepo.create({ name: normalizedName, displayName }));
        } catch (error) {
          if (!isUniqueViolation(error)) {
            this.logger.warn(
              JSON.stringify({
                event: 'announce_tag_create_failed',
                postId,
                name: normalizedName,
                error: String(error),
              }),
            );
            continue;
          }
          tag = await tagRepo.findOne({ where: { name: normalizedName } });
          if (tag === null) continue;
        }
      }

      try {
        await postTagsRepo.save(postTagsRepo.create({ postId, tagId: tag.id }));
      } catch (error) {
        if (!isUniqueViolation(error)) {
          this.logger.warn(
            JSON.stringify({
              event: 'announce_tag_attach_failed',
              postId,
              tagId: tag.id,
              error: String(error),
            }),
          );
        }
      }
    }
  }
}

/** Shared by `handleCreate` and `handleUpdateNote` (§58's 5,000-char post body cap) — a
 * remote `Note`'s `content` is otherwise trusted verbatim, same as on create. */
function sanitizeNoteContent(content: string): string {
  return content.slice(0, 5000);
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
