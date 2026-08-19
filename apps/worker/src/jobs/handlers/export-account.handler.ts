import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AccountExport,
  Actor,
  ActorPrivacyPrefs,
  Bookmark,
  ConversationMember,
  Credential,
  exportAccountPayloadSchema,
  Follow,
  Like,
  Media,
  Message,
  Post,
  PostEdit,
  Report,
  Repost,
  TagMute,
  User,
  type JobType,
} from '@patches/database';
import { ACCOUNT_EXPORT_EXPIRES_AFTER_DAYS } from '@patches/domain';
import { type StorageClient } from '@patches/media';
import { In, type DataSource } from 'typeorm';

import { DATA_SOURCE } from '../../database/database.module.js';
import { STORAGE_CLIENT } from '../../storage/storage.module.js';
import { type JobContext, type JobHandler } from '../job-handler.js';

const EXPORT_FORMAT_VERSION = 1;

const README = [
  'This is a Patches account data export (INITIAL_VISION.md §197.3).',
  '',
  "It is one self-describing JSON document, not a directory tree of files: this node's",
  'export job does not yet package uploaded media bytes or a multi-file archive — only',
  'metadata about your media (id, dimensions, upload date) is included below, not the images',
  'themselves. A future export version will add the media files and split this document into',
  'the fuller per-category layout the specification describes; this is a known, documented',
  'simplification, not a data-loss bug.',
  '',
  'Filters, filter lists, and labeler subscriptions (spec §198-200) are not included because',
  'this node does not implement those features yet — there is nothing to export.',
  '',
  'Every date below is ISO-8601 UTC. "directMessages" includes messages you sent and messages',
  'sent to you in a conversation you are (or were) a member of; a null "body" means the message',
  'was deleted (tombstoned) before this export ran.',
].join('\n');

/** Object storage key for one export archive — one JSON document per `(actorId, exportId)`
 * pair, matching the entity doc's documented layout (`account-export.entity.ts`). */
function exportObjectKey(actorId: string, exportId: string): string {
  return `exports/${actorId}/${exportId}.json`;
}

/**
 * `EXPORT_ACCOUNT` (P14-010, `INITIAL_VISION.md` §197.3, §204): builds the requesting actor's
 * data export and uploads it to object storage as one JSON document, then marks the
 * `account_exports` row `READY`.
 *
 * Idempotent (`docs/architecture/jobs.md` §7): a row that is no longer `PENDING` — already
 * `READY`/`FAILED`/`EXPIRED`, or simply gone — is a no-op, so a redelivered/duplicate job
 * never re-uploads or double-expires anything.
 *
 * Only one `READY` archive is kept per actor at a time (§204,
 * `ACCOUNT_EXPORT_MAX_READY_ARCHIVES`): once this export becomes `READY`, any other `READY`
 * row for the same actor is expired and its object deleted.
 */
@Injectable()
export class ExportAccountHandler implements JobHandler {
  readonly type: JobType = 'EXPORT_ACCOUNT';
  private readonly logger = new Logger(ExportAccountHandler.name);

  constructor(
    @Inject(DATA_SOURCE) private readonly dataSource: DataSource,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
  ) {}

  async handle(payload: unknown, _ctx: JobContext): Promise<void> {
    const { exportId, actorId } = exportAccountPayloadSchema.parse(payload);

    const exports = this.dataSource.getRepository(AccountExport);
    const row = await exports.findOne({ where: { id: exportId } });
    if (row === null) {
      this.logger.warn(JSON.stringify({ exportId, actorId, outcome: 'EXPORT_ROW_MISSING' }));
      return;
    }
    if (row.status !== 'PENDING') return;

    const document = await this.buildExportDocument(actorId);
    const key = exportObjectKey(actorId, exportId);
    await this.storage.putObject(key, Buffer.from(JSON.stringify(document, null, 2), 'utf8'), {
      contentType: 'application/json',
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ACCOUNT_EXPORT_EXPIRES_AFTER_DAYS * 86_400_000);

    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(AccountExport)
        .update({ id: exportId }, { status: 'READY', readyAt: now, objectKey: key, expiresAt });

      // §204: only one READY archive per actor — this new one replaces any other.
      const priorReady = await manager
        .getRepository(AccountExport)
        .find({ where: { actorId, status: 'READY' } });
      for (const prior of priorReady) {
        if (prior.id === exportId) continue;
        if (prior.objectKey !== null) await this.storage.deleteObject(prior.objectKey);
        await manager
          .getRepository(AccountExport)
          .update({ id: prior.id }, { status: 'EXPIRED', objectKey: null });
      }
    });

    this.logger.log(JSON.stringify({ exportId, actorId, outcome: 'EXPORT_READY' }));
  }

  private async buildExportDocument(actorId: string): Promise<Record<string, unknown>> {
    const manager = this.dataSource.manager;

    const actor = await manager.getRepository(Actor).findOne({ where: { id: actorId } });
    const user =
      actor?.userId === null || actor?.userId === undefined
        ? null
        : await manager.getRepository(User).findOne({ where: { id: actor.userId } });

    const credentials =
      user === null
        ? []
        : await manager.getRepository(Credential).find({ where: { userId: user.id } });

    const posts = await manager
      .getRepository(Post)
      .find({ where: { authorActorId: actorId }, order: { createdAt: 'ASC' } });
    const postIds = posts.map((post) => post.id);
    const postEdits =
      postIds.length === 0
        ? []
        : await manager.getRepository(PostEdit).find({ where: { postId: In(postIds) } });

    const media = await manager
      .getRepository(Media)
      .find({ where: { ownerActorId: actorId }, order: { createdAt: 'ASC' } });

    const following = await manager
      .getRepository(Follow)
      .find({ where: { followerActorId: actorId } });
    const followers = await manager
      .getRepository(Follow)
      .find({ where: { followeeActorId: actorId } });

    const likes = await manager.getRepository(Like).find({ where: { actorId } });
    const bookmarks = await manager.getRepository(Bookmark).find({ where: { actorId } });
    const reposts = await manager.getRepository(Repost).find({ where: { actorId } });

    const mutedTags = await manager
      .getRepository(TagMute)
      .find({ where: { actorId }, relations: { tag: true } });

    const memberships = await manager
      .getRepository(ConversationMember)
      .find({ where: { actorId } });
    const conversationIds = memberships.map((membership) => membership.conversationId);
    const messages =
      conversationIds.length === 0
        ? []
        : await manager
            .getRepository(Message)
            .find({ where: { conversationId: In(conversationIds) }, order: { createdAt: 'ASC' } });

    const reportsFiled = await manager
      .getRepository(Report)
      .find({ where: { reporterActorId: actorId } });

    const privacyPrefs = await manager
      .getRepository(ActorPrivacyPrefs)
      .findOne({ where: { actorId } });

    return {
      formatVersion: EXPORT_FORMAT_VERSION,
      generatedAt: new Date().toISOString(),
      readme: README,
      profile:
        actor === null
          ? null
          : {
              actorId: actor.id,
              handle: actor.handle,
              displayName: actor.displayName,
              bio: actor.bio,
              locationText: actor.locationText,
              websiteUrl: actor.websiteUrl,
              createdAt: actor.createdAt.toISOString(),
              recoveryEmail: user?.recoveryEmail ?? null,
              emailVerified: user?.emailVerifiedAt !== null && user?.emailVerifiedAt !== undefined,
            },
      // Credential *metadata* only — never `secretHash` (spec §177, §153).
      credentials: credentials.map((credential) => ({
        type: credential.type,
        label: credential.label,
        identifier: credential.identifier,
        createdAt: credential.createdAt.toISOString(),
        revokedAt: credential.revokedAt?.toISOString() ?? null,
      })),
      posts: posts.map((post) => ({
        id: post.id,
        body: post.body,
        postType: post.postType,
        linkUrl: post.linkUrl,
        visibility: post.visibility,
        contentWarning: post.contentWarning,
        inReplyToId: post.inReplyToId,
        rootPostId: post.rootPostId,
        communityId: post.communityId,
        quotedPostId: post.quotedPostId,
        createdAt: post.createdAt.toISOString(),
        editedAt: post.editedAt?.toISOString() ?? null,
        deletedAt: post.deletedAt?.toISOString() ?? null,
        editHistory: postEdits
          .filter((edit) => edit.postId === post.id)
          .map((edit) => ({
            previousBody: edit.previousBody,
            previousContentWarning: edit.previousContentWarning,
            createdAt: edit.createdAt.toISOString(),
          })),
      })),
      media: media.map((item) => ({
        id: item.id,
        state: item.state,
        mimeType: item.mimeType,
        width: item.width,
        height: item.height,
        byteSize: item.byteSize,
        altText: item.altText,
        createdAt: item.createdAt.toISOString(),
      })),
      follows: {
        following: following.map((row) => ({
          actorId: row.followeeActorId,
          since: row.createdAt.toISOString(),
        })),
        followers: followers.map((row) => ({
          actorId: row.followerActorId,
          since: row.createdAt.toISOString(),
        })),
      },
      likes: likes.map((row) => ({ postId: row.postId, createdAt: row.createdAt.toISOString() })),
      bookmarks: bookmarks.map((row) => ({
        postId: row.postId,
        createdAt: row.createdAt.toISOString(),
      })),
      reposts: reposts.map((row) => ({
        postId: row.postId,
        createdAt: row.createdAt.toISOString(),
      })),
      mutedTags: mutedTags.map((row) => ({
        name: row.tag.name,
        mutedAt: row.createdAt.toISOString(),
      })),
      directMessages: messages.map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
        senderActorId: message.senderActorId,
        body: message.deletedAt === null ? message.body : null,
        createdAt: message.createdAt.toISOString(),
      })),
      reportsFiled: reportsFiled.map((report) => ({
        id: report.id,
        subjectType: report.subjectType,
        reason: report.reason,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
      })),
      privacyPrefs:
        privacyPrefs === null
          ? null
          : {
              discoverable: privacyPrefs.discoverable,
              indexable: privacyPrefs.indexable,
              showInLocalFeed: privacyPrefs.showInLocalFeed,
              locked: privacyPrefs.locked,
              privacyNoticeVersion: privacyPrefs.privacyNoticeVersion,
              privacyNoticeAcknowledgedAt:
                privacyPrefs.privacyNoticeAcknowledgedAt?.toISOString() ?? null,
            },
    };
  }
}
