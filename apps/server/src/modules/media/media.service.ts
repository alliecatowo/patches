import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Media, OutboxJob } from '@patches/database';
import { mediaOriginalKey, type StorageClient } from '@patches/media';
import { DataSource } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { getRequestContext } from '../../common/context/request-context.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { RateLimitService } from '../auth/rate-limit.service.js';
import type {
  BeginMediaUploadInput,
  BeginMediaUploadResult,
  FinalizeMediaUploadResult,
  MediaDownloadView,
} from './media.dto.js';
import { STORAGE_CLIENT } from './storage-client.provider.js';
import { parseInput, uuidInputSchema, validateBeginMediaUploadInput } from './validation.js';

/**
 * The application service behind `patches.v1.MediaService` (spec §29–32, §54,
 * `docs/architecture/media.md`).
 *
 * Image bytes never transit this process (§153): `beginMediaUpload` only issues a presigned
 * PUT, `finalizeMediaUpload` only `HEAD`s the object to confirm the client's claim, and
 * `getMediaDownload` only issues a presigned GET.
 */
@Injectable()
export class MediaService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
    private readonly config: AppConfigService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async beginMediaUpload(input: BeginMediaUploadInput): Promise<BeginMediaUploadResult> {
    this.rateLimit.consumePeer('media_begin_upload', getRequestContext()?.peer);
    this.rateLimit.consume('media_begin_upload', input.actorId);
    validateBeginMediaUploadInput(input);

    const id = randomUUID();
    const key = mediaOriginalKey(id);
    const { url, expiresAt } = await this.storage.presignPut(key, {
      contentType: input.mimeType,
      contentLength: input.byteSize,
      expiresInSeconds: this.config.mediaPresignPutTtlSeconds,
    });

    const media = this.dataSource.getRepository(Media);
    await media.save(
      media.create({
        id,
        ownerActorId: input.actorId,
        state: 'PENDING_UPLOAD',
        // Staged here as the client's *claimed* hash, not a verified one — nothing outside
        // `PROCESS_MEDIA` reads `contentHash` on a non-`READY` row as trustworthy. The worker
        // reads it (passed through via the job payload in `finalizeMediaUpload`) and compares
        // it against the real downloaded bytes; on a match it overwrites this column with the
        // identical value, on a mismatch the row is marked `FAILED` (`media.proto`'s
        // documented contract: "verified against the uploaded object by the worker").
        contentHash: input.sha256,
      }),
    );

    return { mediaId: id, uploadUrl: url, expiresAt };
  }

  async finalizeMediaUpload(
    actorId: string,
    mediaIdRaw: string,
  ): Promise<FinalizeMediaUploadResult> {
    const mediaId = parseInput(uuidInputSchema, mediaIdRaw);

    // State + ownership are read before the transaction opens so the storage HEAD below can
    // also run before it (ADR 0039 rule 1: no third-party network I/O inside a transaction —
    // a HEAD holds the pooled connection across latency we don't control).
    const repository = this.dataSource.getRepository(Media);
    const media = await repository.findOne({ where: { id: mediaId } });
    if (media === null || media.ownerActorId !== actorId) {
      throw mediaNotFound();
    }

    if (media.state !== 'PENDING_UPLOAD') {
      // Idempotent (`docs/architecture/jobs.md` §7): already finalized (or terminal) —
      // report the current state rather than re-`HEAD`ing storage or double-enqueueing.
      return { mediaId: media.id, state: media.state };
    }

    // Confirm the client's claimed upload before opening the transaction. Both the HEAD and
    // the state read now see the same pre-transaction snapshot, so a missing object still
    // aborts without touching the DB. The HEAD-commit gap (object deleted just after this
    // check) doesn't matter: the PROCESS_MEDIA job re-fetches the real object and marks the
    // row FAILED if it's gone.
    const head = await this.storage.head(mediaOriginalKey(media.id));
    if (head === null || head.contentLength === 0) {
      throw AppError.validation('Uploaded object not found — finish the upload before finalizing.');
    }

    return this.dataSource.transaction(async (manager) => {
      // Conditional UPDATE, not a plain read-then-write: two concurrent `FinalizeMediaUpload`
      // calls for the same media must not both flip PENDING_UPLOAD → PROCESSING and both
      // enqueue a job.
      const repo = manager.getRepository(Media);
      const claim = await repo.update(
        { id: media.id, state: 'PENDING_UPLOAD' },
        { state: 'PROCESSING' },
      );
      if (claim.affected !== 1) {
        const current = await repo.findOneByOrFail({ id: media.id });
        return { mediaId: current.id, state: current.state };
      }

      const jobs = manager.getRepository(OutboxJob);
      try {
        await jobs.save(
          jobs.create({
            type: 'PROCESS_MEDIA',
            payload: {
              mediaId: media.id,
              ...(media.contentHash !== null ? { expectedSha256: media.contentHash } : {}),
            },
            // One PROCESS_MEDIA job per media row — backstops the conditional UPDATE above
            // against a lost race under true concurrency (both callers observing `affected
            // === 1` is impossible under `READ COMMITTED` since the UPDATE itself serializes,
            // but this also covers a redelivered/retried Finalize call after a crash).
            idempotencyKey: `PROCESS_MEDIA:${media.id}`,
          }),
        );
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }

      return { mediaId: media.id, state: 'PROCESSING' as const };
    });
  }

  /**
   * No owner restriction, deliberately: this is what the TUI calls to render *any* visible
   * post's attached images, not just the caller's own uploads (spec §27 — media is public
   * once attached to a public post). Per-post visibility enforcement (blocks/followers-only)
   * is `PostService`'s concern for the post itself; `docs/architecture/media.md` §6 frames
   * presigned-GET-after-authorization as "authenticated", not "owner", leaving room for
   * follower-only enforcement later without a storage redesign. Tracked as a follow-up once
   * follower-only posts exist (Phase 6+).
   */
  async getMediaDownload(mediaIdRaw: string): Promise<MediaDownloadView> {
    const mediaId = parseInput(uuidInputSchema, mediaIdRaw);
    const media = await this.dataSource.getRepository(Media).findOne({ where: { id: mediaId } });

    if (media === null || media.deletedAt !== null) {
      throw mediaNotFound();
    }
    if (media.state !== 'READY') {
      // Not an error: clients poll this RPC after FinalizeMediaUpload until the worker has
      // produced derivatives (proto: `GetMediaDownloadResponse.status`). Report the state
      // with no URLs instead of throwing — the first live upload showed the TUI's attach
      // flow failing instantly on MEDIA_NOT_READY. FAILED is also reported, not thrown.
      return {
        mediaId: media.id,
        state: media.state,
        mimeType: media.mimeType ?? '',
        width: media.width ?? 0,
        height: media.height ?? 0,
        downloadUrl: '',
        thumbnailUrl: '',
        expiresAt: new Date(0),
      };
    }
    if (
      media.displayObjectKey === null ||
      media.mimeType === null ||
      media.width === null ||
      media.height === null
    ) {
      // Shouldn't happen for a READY row (the worker sets all of these together) — an
      // internal inconsistency, not something the client did wrong.
      throw AppError.internal('Media is marked ready but is missing its derivatives.', {
        context: { mediaId: media.id },
      });
    }

    const ttl = this.config.mediaPresignGetTtlSeconds;
    const [display, thumbnail] = await Promise.all([
      this.storage.presignGet(media.displayObjectKey, { expiresInSeconds: ttl }),
      media.thumbnailObjectKey !== null
        ? this.storage.presignGet(media.thumbnailObjectKey, { expiresInSeconds: ttl })
        : Promise.resolve(undefined),
    ]);

    return {
      mediaId: media.id,
      state: media.state,
      mimeType: media.mimeType,
      width: media.width,
      height: media.height,
      downloadUrl: display.url,
      thumbnailUrl: thumbnail?.url ?? '',
      expiresAt: display.expiresAt,
    };
  }
}

function mediaNotFound(): AppError {
  // Deliberately the same message whether the id doesn't exist or belongs to someone else —
  // same reasoning as `PostService.attachableMedia` (`post.service.ts`): don't let the error
  // text distinguish "not found" from "not yours".
  return new AppError('MEDIA_NOT_FOUND', 'No such media, or it does not belong to you.');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
