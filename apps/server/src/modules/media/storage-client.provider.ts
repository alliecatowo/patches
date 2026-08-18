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

import { AppConfigService } from '../../config/app-config.service.js';

/** DI token for the `StorageClient` — mirrors `apps/worker/src/storage/storage.module.ts`'s
 * `STORAGE_CLIENT`, kept as a parallel (small) implementation rather than a shared package
 * export: it's DI glue tied to each app's own `AppConfigService` type, not business logic. */
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

/** Throws if storage isn't configured — called lazily (see `LazyStorageClient` below), not
 * at module-init time, so a server that never calls a `MediaService` RPC can boot without R2
 * configured at all (mirrors `AppConfigService.jwtPrivateKeyPem`'s "fail at first use, not at
 * boot" pattern already established for auth). */
export function buildStorageClient(config: AppConfigService): StorageClient {
  const missing = missingStorageVars(config);
  if (missing.length > 0) {
    throw new Error(
      `Object storage is not configured: missing ${missing.join(', ')}. Set these to use ` +
        'MediaService (see .env.example).',
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

export const storageClientProvider = {
  provide: STORAGE_CLIENT,
  useFactory: (config: AppConfigService): StorageClient => new LazyStorageClient(config),
  inject: [AppConfigService],
};
