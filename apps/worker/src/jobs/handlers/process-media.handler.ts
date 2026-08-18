import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ACCEPTED_MEDIA_CONTENT_TYPES,
  isAcceptedMediaContentType,
  mediaOriginalKey,
  mediaVariantKey,
  type StorageClient,
} from '@patches/media';
import { Media, processMediaPayloadSchema, type JobType } from '@patches/database';
import sharp from 'sharp';
import type { DataSource } from 'typeorm';

import { AppConfigService } from '../../config/app-config.service.js';
import { DATA_SOURCE } from '../../database/database.module.js';
import { STORAGE_CLIENT } from '../../storage/storage.module.js';
import { type JobContext, type JobHandler } from '../job-handler.js';

/** Longest edge of the "display" derivative — large enough for full-width TUI rendering
 * without shipping the original's full resolution (`docs/architecture/media.md` §4). */
const DISPLAY_MAX_DIMENSION_PX = 2048;
/** Longest edge of the "thumbnail" derivative — feed-row/preview scale. */
const THUMBNAIL_MAX_DIMENSION_PX = 400;
const DERIVATIVE_CONTENT_TYPE = 'image/webp';
const DISPLAY_WEBP_QUALITY = 82;
const THUMBNAIL_WEBP_QUALITY = 72;

/** sharp's real detected format → our content-type allowlist. Deliberately narrower than
 * every format sharp can decode — §31: never trust the client's declared type, only the
 * decoded file's real signature, and only the v0-accepted set gets through either way. */
const SHARP_FORMAT_TO_CONTENT_TYPE: Readonly<Partial<Record<string, string>>> = Object.freeze({
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
});

/** Thrown for defects in the *uploaded file itself* — never retried, always terminal
 * (`markMediaFailed`), as opposed to an infra error (network/DB), which the caller lets
 * propagate so the job runner retries with backoff. */
class MediaValidationError extends Error {}

/**
 * `PROCESS_MEDIA` (`docs/architecture/media.md` §4, `INITIAL_VISION.md` §31): downloads the
 * client's uploaded original, validates it against its *real* decoded signature/metadata
 * (never the client-declared content type or dimensions), normalizes orientation, strips
 * metadata, produces display/thumbnail derivatives, and marks the row `READY` — or `FAILED`
 * with a reason, which is a normal terminal outcome, not a job failure (the job did its job).
 *
 * Idempotent (`docs/architecture/jobs.md` §7): if the row is already `READY`/`FAILED` when
 * this runs (a redelivered/duplicate job), it's a no-op — re-running derivative generation
 * for an already-terminal row would just waste work, and could downgrade a `READY` row's
 * `processedAt` for no reason.
 */
@Injectable()
export class ProcessMediaHandler implements JobHandler {
  readonly type: JobType = 'PROCESS_MEDIA';
  private readonly logger = new Logger(ProcessMediaHandler.name);

  constructor(
    @Inject(DATA_SOURCE) private readonly dataSource: DataSource,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
    private readonly config: AppConfigService,
  ) {}

  async handle(payload: unknown, _ctx: JobContext): Promise<void> {
    const { mediaId } = processMediaPayloadSchema.parse(payload);
    const repository = this.dataSource.getRepository(Media);

    const media = await repository.findOne({ where: { id: mediaId } });
    if (media === null) {
      // Permanent — the row is gone (e.g. the owning post/account was purged). Retrying
      // will never make it reappear, so this is a no-op completion, not a failure.
      this.logger.warn(JSON.stringify({ mediaId, outcome: 'MEDIA_ROW_MISSING' }));
      return;
    }
    if (media.state === 'READY' || media.state === 'FAILED') {
      return;
    }

    try {
      await this.process(media);
    } catch (error) {
      if (error instanceof MediaValidationError) {
        await repository.update({ id: mediaId }, { state: 'FAILED', processedAt: new Date() });
        this.logger.warn(
          JSON.stringify({ mediaId, outcome: 'MEDIA_FAILED', reason: error.message }),
        );
        return;
      }
      throw error;
    }
  }

  private async process(media: Media): Promise<void> {
    const originalKey = mediaOriginalKey(media.id);
    const maxBytes = this.config.mediaMaxBytes;

    const downloaded = await this.storage.getObject(originalKey, { maxBytes });
    if (downloaded.contentLength === 0) {
      throw new MediaValidationError('Uploaded object is empty.');
    }

    // §31: never trust the filename/client-declared MIME type or dimensions — only what
    // sharp decodes from the real file signature.
    const pipeline = sharp(downloaded.body, { limitInputPixels: this.config.mediaMaxPixels });
    let metadata: sharp.Metadata;
    try {
      metadata = await pipeline.metadata();
    } catch (error) {
      throw new MediaValidationError(
        `Could not decode image: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const contentType =
      metadata.format !== undefined ? SHARP_FORMAT_TO_CONTENT_TYPE[metadata.format] : undefined;
    if (contentType === undefined || !isAcceptedMediaContentType(contentType)) {
      throw new MediaValidationError(
        `Unsupported image format "${metadata.format ?? 'unknown'}" — accepted: ${ACCEPTED_MEDIA_CONTENT_TYPES.join(', ')}.`,
      );
    }
    if (metadata.width === undefined || metadata.height === undefined) {
      throw new MediaValidationError('Decoded image is missing dimensions.');
    }

    // `.rotate()` with no args auto-orients from EXIF and drops the orientation tag; sharp
    // strips all other metadata (EXIF/GPS/ICC etc.) by default unless `.withMetadata()` is
    // called, which it deliberately never is here (§31: omit sensitive metadata).
    const oriented = pipeline.clone().rotate();
    const orientedMeta = await oriented.clone().toBuffer({ resolveWithObject: true });
    const { width: finalWidth, height: finalHeight } = orientedMeta.info;

    const [display, thumbnail] = await Promise.all([
      sharp(orientedMeta.data)
        .resize({
          width: DISPLAY_MAX_DIMENSION_PX,
          height: DISPLAY_MAX_DIMENSION_PX,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: DISPLAY_WEBP_QUALITY })
        .toBuffer(),
      sharp(orientedMeta.data)
        .resize({
          width: THUMBNAIL_MAX_DIMENSION_PX,
          height: THUMBNAIL_MAX_DIMENSION_PX,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: THUMBNAIL_WEBP_QUALITY })
        .toBuffer(),
    ]);

    const contentHash = createHash('sha256').update(downloaded.body).digest('hex');
    const displayKey = mediaVariantKey(media.id, 'display');
    const thumbnailKey = mediaVariantKey(media.id, 'thumb');

    await Promise.all([
      this.storage.putObject(displayKey, display, { contentType: DERIVATIVE_CONTENT_TYPE }),
      this.storage.putObject(thumbnailKey, thumbnail, { contentType: DERIVATIVE_CONTENT_TYPE }),
    ]);

    await this.dataSource.getRepository(Media).update(
      { id: media.id },
      {
        state: 'READY',
        sourceObjectKey: originalKey,
        displayObjectKey: displayKey,
        thumbnailObjectKey: thumbnailKey,
        mimeType: contentType,
        width: finalWidth,
        height: finalHeight,
        byteSize: String(downloaded.contentLength),
        contentHash,
        processedAt: new Date(),
      },
    );
  }
}
