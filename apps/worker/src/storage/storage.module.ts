import { Module } from '@nestjs/common';
import {
  S3StorageClient,
  type DownloadedObject,
  type ObjectMetadata,
  type PresignGetOptions,
  type PresignGetResult,
  type PresignPutOptions,
  type PresignPutResult,
  type StorageClient,
} from '@patches/media';

import { AppConfigService } from '../config/app-config.service.js';

/** DI token for the `StorageClient` (no interface-as-token — see `EMAIL_PROVIDER` for the
 * same pattern in `../email/email-provider.ts`). */
export const STORAGE_CLIENT = 'STORAGE_CLIENT';

function missingStorageVars(config: AppConfigService): string[] {
  return (
    [
      ['R2_ENDPOINT', config.storageEndpoint],
      ['R2_BUCKET', config.storageBucket],
      ['R2_ACCESS_KEY_ID', config.storageAccessKeyId],
      ['R2_SECRET_ACCESS_KEY', config.storageSecretAccessKey],
    ] as const
  )
    .filter(([, value]) => value === undefined || value.length === 0)
    .map(([name]) => name);
}

/**
 * Builds the real `S3StorageClient` from validated config. Throws if any required variable
 * is missing — called lazily by {@link LazyStorageClient}, not at module-init time, so a
 * worker that never claims a media job can boot without storage configured at all (mirrors
 * `AppConfigService.jwtPrivateKeyPem`'s "fail at first use, not at boot" pattern on the
 * server side).
 */
export function buildStorageClient(config: AppConfigService): StorageClient {
  const missing = missingStorageVars(config);
  if (missing.length > 0) {
    throw new Error(
      `Object storage is not configured: missing ${missing.join(', ')}. Set these to run ` +
        'PROCESS_MEDIA/CLEAN_EXPIRED_UPLOADS jobs (see .env.example).',
    );
  }

  return new S3StorageClient({
    endpoint: config.storageEndpoint as string,
    region: config.storageRegion,
    bucket: config.storageBucket as string,
    accessKeyId: config.storageAccessKeyId as string,
    secretAccessKey: config.storageSecretAccessKey as string,
    forcePathStyle: config.storageForcePathStyle,
  });
}

/**
 * Defers building the real client until the first call, so an unconfigured worker boots
 * cleanly (nothing has asked for storage yet) and only a job that actually needs it hits the
 * clear "not configured" error above — which the job runner then retries with backoff rather
 * than crashing the whole process (`docs/architecture/jobs.md` §5).
 */
class LazyStorageClient implements StorageClient {
  private client: StorageClient | undefined;

  constructor(private readonly config: AppConfigService) {}

  private resolve(): StorageClient {
    this.client ??= buildStorageClient(this.config);
    return this.client;
  }

  presignPut(key: string, options: PresignPutOptions): Promise<PresignPutResult> {
    return this.resolve().presignPut(key, options);
  }

  presignGet(key: string, options: PresignGetOptions): Promise<PresignGetResult> {
    return this.resolve().presignGet(key, options);
  }

  head(key: string): Promise<ObjectMetadata | null> {
    return this.resolve().head(key);
  }

  getObject(key: string, options?: { maxBytes?: number }): Promise<DownloadedObject> {
    return this.resolve().getObject(key, options);
  }

  putObject(key: string, body: Buffer, options: { contentType: string }): Promise<void> {
    return this.resolve().putObject(key, body, options);
  }

  deleteObject(key: string): Promise<void> {
    return this.resolve().deleteObject(key);
  }
}

@Module({
  providers: [
    {
      provide: STORAGE_CLIENT,
      useFactory: (config: AppConfigService): StorageClient => new LazyStorageClient(config),
      inject: [AppConfigService],
    },
  ],
  exports: [STORAGE_CLIENT],
})
export class StorageModule {}
