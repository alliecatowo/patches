import { Inject, Injectable, Logger } from '@nestjs/common';
import { Media, cleanExpiredUploadsPayloadSchema, type JobType } from '@patches/database';
import { mediaOriginalKey, type StorageClient } from '@patches/media';
import { LessThan, type DataSource } from 'typeorm';

import { AppConfigService } from '../../config/app-config.service.js';
import { DATA_SOURCE } from '../../database/database.module.js';
import { STORAGE_CLIENT } from '../../storage/storage.module.js';
import { type JobContext, type JobHandler } from '../job-handler.js';

/**
 * Sweeps `media` rows stuck in `PENDING_UPLOAD` past `MEDIA_PENDING_UPLOAD_EXPIRY_MINUTES`
 * (`docs/architecture/media.md` §1) — a `BeginMediaUpload` whose client never called
 * `FinalizeMediaUpload` (abandoned upload, crashed client, or a presigned PUT that was
 * never used before it expired). Deletes the (possibly-never-uploaded) original object and
 * the row itself: a `PENDING_UPLOAD` row can never be attached to a post
 * (`PostService.attachableMedia` only accepts `READY` media), so nothing references it.
 *
 * Naturally idempotent (`docs/architecture/jobs.md` §7): deleting an already-deleted object
 * is a no-op (`StorageClient.deleteObject`), and re-running after a partial failure just
 * re-sweeps whatever is still there. Each row is handled independently — one row's storage
 * error is logged and skipped rather than blocking the rest of the batch or dead-lettering
 * the whole job over a single object.
 */
@Injectable()
export class CleanExpiredUploadsHandler implements JobHandler {
  readonly type: JobType = 'CLEAN_EXPIRED_UPLOADS';
  private readonly logger = new Logger(CleanExpiredUploadsHandler.name);

  constructor(
    @Inject(DATA_SOURCE) private readonly dataSource: DataSource,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
    private readonly config: AppConfigService,
  ) {}

  async handle(payload: unknown, _ctx: JobContext): Promise<void> {
    cleanExpiredUploadsPayloadSchema.parse(payload);

    const cutoff = new Date(Date.now() - this.config.mediaPendingUploadExpiryMinutes * 60_000);
    const repository = this.dataSource.getRepository(Media);
    const expired = await repository.find({
      where: { state: 'PENDING_UPLOAD', createdAt: LessThan(cutoff) },
    });

    let swept = 0;
    for (const media of expired) {
      try {
        await this.storage.deleteObject(mediaOriginalKey(media.id));
        await repository.delete({ id: media.id });
        swept += 1;
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            mediaId: media.id,
            outcome: 'CLEAN_EXPIRED_UPLOAD_FAILED',
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }

    this.logger.log(
      JSON.stringify({ outcome: 'CLEAN_EXPIRED_UPLOADS', found: expired.length, swept }),
    );
  }
}
