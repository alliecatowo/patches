import { describe, expect, it } from 'vitest';

import { type AppConfigService } from '../config/app-config.service.js';
import { buildStorageClient } from './storage.module.js';

function fakeConfig(overrides: Partial<AppConfigService> = {}): AppConfigService {
  return {
    storageEndpoint: 'http://127.0.0.1:9000',
    storageBucket: 'patches-media',
    storageAccessKeyId: 'patches',
    storageSecretAccessKey: 'patchespatches',
    storageRegion: 'auto',
    storageForcePathStyle: true,
    ...overrides,
  } as AppConfigService;
}

describe('buildStorageClient', () => {
  it('builds a client when every required variable is set', () => {
    expect(() => buildStorageClient(fakeConfig())).not.toThrow();
  });

  it('throws a clear error listing every missing variable', () => {
    expect(() =>
      buildStorageClient(fakeConfig({ storageEndpoint: undefined, storageBucket: undefined })),
    ).toThrow(/R2_ENDPOINT.*R2_BUCKET/s);
  });
});
