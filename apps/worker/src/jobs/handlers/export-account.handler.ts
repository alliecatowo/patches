import { createHash } from 'node:crypto';
import { buffer as streamToBuffer } from 'node:stream/consumers';
import { createGzip } from 'node:zlib';

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AccountExport,
  Actor,
  ActorPrivacyPrefs,
  Bookmark,
  Credential,
  exportAccountPayloadSchema,
  Follow,
  Like,
  Media,
  Post,
  PostEdit,
  Report,
  Repost,
  TagMute,
  User,
  type JobType,
} from '@patches/database';
import { ACCOUNT_EXPORT_EXPIRES_AFTER_DAYS } from '@patches/domain';
import {
  isAcceptedMediaContentType,
  MEDIA_CONTENT_TYPE_EXTENSION,
  type StorageClient,
} from '@patches/media';
import { pack as tarPack } from 'tar-stream';
import { In, type DataSource } from 'typeorm';

import { DATA_SOURCE } from '../../database/database.module.js';
import { STORAGE_CLIENT } from '../../storage/storage.module.js';
import { type JobContext, type JobHandler } from '../job-handler.js';

const EXPORT_FORMAT_VERSION = 2;

const README = [
  'This is a Patches account data export (INITIAL_VISION.md §197.3, §204.2).',
  '',
  'It is a gzipped tar archive (`.tar.gz`) with one file per data category, plus your media',
  'originals under `media/<id>.<ext>` and a `manifest.json` listing every file in this',
  'archive together with its sha256 so you can verify nothing was corrupted in transit:',
  '',
  '  account.json   — profile, credential metadata, likes, bookmarks, reposts, muted tags,',
  '                   reports you filed, privacy preferences, and media item metadata',
  '                   (dimensions, upload date — the bytes themselves are under media/).',
  '  posts.json     — every post you authored, including its edit history.',
  '  follows.json   — who you follow and who follows you.',
  '  media/         — the original bytes of every image you uploaded that is not deleted.',
  '  manifest.json  — every file above, its byte size, and its sha256.',
  '',
  'Direct messages are NOT in this archive, and that is not an omission we can fix: this node',
  'only ever stores your conversations end-to-end encrypted, so it holds no readable copy of',
  'any message to put here. The only device that can read your messages is your own — export',
  'them from the client that holds your keys.',
  '',
  'Filters, filter lists, and labeler subscriptions (spec §198-200) are not included because',
  'this node does not implement those features yet — there is nothing to export.',
  '',
  'Every date in this archive is ISO-8601 UTC.',
].join('\n');

export interface ArchiveFile {
  name: string;
  buffer: Buffer;
}

/** Object storage key for one export archive — one `.tar.gz` per `(actorId, exportId)` pair. */
function exportObjectKey(actorId: string, exportId: string): string {
  return `exports/${actorId}/${exportId}.tar.gz`;
}

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function jsonFile(name: string, document: unknown): ArchiveFile {
  return { name, buffer: Buffer.from(JSON.stringify(document, null, 2), 'utf8') };
}

/** Streams every `ArchiveFile` (plus a trailing `manifest.json` describing them) through
 * `tar-stream` and gzip, buffering the compressed result — `StorageClient.putObject` takes a
 * `Buffer`, not a stream (§153: the interface is shared with the client-facing presigned-URL
 * path, which never buffers unboundedly; the worker side already buffers whole objects
 * elsewhere, e.g. `getObject`). */
export async function buildTarGz(files: readonly ArchiveFile[]): Promise<Buffer> {
  const manifest = jsonFile('manifest.json', {
    formatVersion: EXPORT_FORMAT_VERSION,
    files: files.map((file) => ({
      name: file.name,
      bytes: file.buffer.length,
      sha256: sha256Hex(file.buffer),
    })),
  });

  const pack = tarPack();
  const gzip = createGzip();
  pack.pipe(gzip);
  const gzippedPromise = streamToBuffer(gzip);

  for (const file of [...files, manifest]) {
    await new Promise<void>((resolve, reject) => {
      pack.entry({ name: file.name, size: file.buffer.length }, file.buffer, (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }
  pack.finalize();

  return gzippedPromise;
}

/**
 * `EXPORT_ACCOUNT` (P14-010/P14-023, `INITIAL_VISION.md` §197.3, §204.2): builds the requesting
 * actor's data export as a gzipped tar archive (`account.json`, `posts.json`, `follows.json`,
 * `media/<id>.<ext>`, `manifest.json`) and uploads it to object storage, then
 * marks the `account_exports` row `READY`.
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

    const files = await this.buildArchiveFiles(actorId);
    const archive = await buildTarGz(files);
    const key = exportObjectKey(actorId, exportId);
    await this.storage.putObject(key, archive, { contentType: 'application/gzip' });

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

  private async buildArchiveFiles(actorId: string): Promise<ArchiveFile[]> {
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

    const reportsFiled = await manager
      .getRepository(Report)
      .find({ where: { reporterActorId: actorId } });

    const privacyPrefs = await manager
      .getRepository(ActorPrivacyPrefs)
      .findOne({ where: { actorId } });

    const mediaFiles = await this.fetchMediaFiles(media);
    const mediaArchivePathById = new Map(mediaFiles.map((file) => [file.mediaId, file.name]));

    const account = jsonFile('account.json', {
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
      media: media.map((item) => ({
        id: item.id,
        state: item.state,
        mimeType: item.mimeType,
        width: item.width,
        height: item.height,
        byteSize: item.byteSize,
        altText: item.altText,
        createdAt: item.createdAt.toISOString(),
        archivePath: mediaArchivePathById.get(item.id) ?? null,
      })),
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
    });

    const postsFile = jsonFile('posts.json', {
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
    });

    const followsFile = jsonFile('follows.json', {
      following: following.map((row) => ({
        actorId: row.followeeActorId,
        since: row.createdAt.toISOString(),
      })),
      followers: followers.map((row) => ({
        actorId: row.followerActorId,
        since: row.createdAt.toISOString(),
      })),
    });

    // No `messages.json`: §204.2's "your own data, so bodies ARE included" carve-out only ever
    // applied to the plaintext DM table, which ADR 0030 deleted. The node cannot read a message
    // it only stores encrypted, so there is no body to export — the README above says so rather
    // than shipping an empty file that reads like a bug.

    return [
      account,
      postsFile,
      followsFile,
      ...mediaFiles.map((file) => ({ name: file.name, buffer: file.buffer })),
    ];
  }

  /** Fetches each still-live media item's original bytes from storage. Skips media whose
   * content type isn't in the accepted allowlist (shouldn't happen — defense in depth), and
   * media that has no source object key (still `PENDING_UPLOAD`, or already purged). Fetch
   * failures are logged and the item is skipped rather than failing the whole export — a
   * missing image shouldn't block someone from getting the rest of their data. */
  private async fetchMediaFiles(
    media: readonly Media[],
  ): Promise<Array<{ mediaId: string; name: string; buffer: Buffer }>> {
    const files: Array<{ mediaId: string; name: string; buffer: Buffer }> = [];
    for (const item of media) {
      if (item.state === 'DELETED' || item.sourceObjectKey === null) continue;
      if (item.mimeType === null || !isAcceptedMediaContentType(item.mimeType)) continue;

      const extension = MEDIA_CONTENT_TYPE_EXTENSION[item.mimeType];
      try {
        const downloaded = await this.storage.getObject(item.sourceObjectKey);
        files.push({
          mediaId: item.id,
          name: `media/${item.id}.${extension}`,
          buffer: downloaded.body,
        });
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            mediaId: item.id,
            outcome: 'EXPORT_MEDIA_FETCH_FAILED',
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
    return files;
  }
}
