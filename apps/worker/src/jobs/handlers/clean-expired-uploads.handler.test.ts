import type { Media } from '@patches/database';
import type { StorageClient } from '@patches/media';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AppConfigService } from '../../config/app-config.service.js';
import { CleanExpiredUploadsHandler } from './clean-expired-uploads.handler.js';

function fakeConfig(minutes = 60): AppConfigService {
  return { mediaPendingUploadExpiryMinutes: minutes } as AppConfigService;
}

function pendingMedia(id: string, createdAt: Date): Media {
  return {
    id,
    ownerActorId: 'actor-1',
    state: 'PENDING_UPLOAD',
    sourceObjectKey: null,
    displayObjectKey: null,
    thumbnailObjectKey: null,
    mimeType: null,
    width: null,
    height: null,
    byteSize: null,
    altText: null,
    contentHash: null,
    createdAt,
    processedAt: null,
    deletedAt: null,
  } as Media;
}

function fakeStorage(): StorageClient {
  return {
    presignPut: vi.fn(),
    presignGet: vi.fn(),
    head: vi.fn(),
    getObject: vi.fn(),
    putObject: vi.fn(),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
}

describe('CleanExpiredUploadsHandler', () => {
  let repo: { find: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    repo = { find: vi.fn(), delete: vi.fn().mockResolvedValue({ affected: 1 }) };
  });

  it('deletes the storage object and row for each expired PENDING_UPLOAD row', async () => {
    const stale = pendingMedia('media-1', new Date(Date.now() - 2 * 60 * 60_000));
    repo.find.mockResolvedValue([stale]);
    const storage = fakeStorage();
    const handler = new CleanExpiredUploadsHandler(
      { getRepository: () => repo } as never,
      storage,
      fakeConfig(),
    );

    await handler.handle({}, { jobId: '1', attempt: 1 });

    expect(storage.deleteObject).toHaveBeenCalledWith('media/media-1/original');
    expect(repo.delete).toHaveBeenCalledWith({ id: 'media-1' });
  });

  it('queries with a cutoff derived from MEDIA_PENDING_UPLOAD_EXPIRY_MINUTES', async () => {
    repo.find.mockResolvedValue([]);
    const handler = new CleanExpiredUploadsHandler(
      { getRepository: () => repo } as never,
      fakeStorage(),
      fakeConfig(30),
    );

    const before = Date.now();
    await handler.handle({}, { jobId: '1', attempt: 1 });

    const [query] = repo.find.mock.calls[0] as [{ where: { createdAt: { _value: Date } } }];
    // TypeORM's LessThan() wraps the operand in `_value` — assert the cutoff is ~30 minutes
    // before "now" rather than depending on that internal shape too precisely.
    const cutoffMs = query.where.createdAt._value.getTime();
    expect(before - cutoffMs).toBeGreaterThanOrEqual(29 * 60_000);
    expect(before - cutoffMs).toBeLessThanOrEqual(31 * 60_000);
  });

  it('skips a row whose storage delete fails, without throwing (retried next sweep)', async () => {
    const stale = pendingMedia('media-2', new Date(Date.now() - 2 * 60 * 60_000));
    repo.find.mockResolvedValue([stale]);
    const storage = fakeStorage();
    (storage.deleteObject as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('R2 down'));
    const handler = new CleanExpiredUploadsHandler(
      { getRepository: () => repo } as never,
      storage,
      fakeConfig(),
    );

    await expect(handler.handle({}, { jobId: '1', attempt: 1 })).resolves.toBeUndefined();
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('does nothing when no rows are expired', async () => {
    repo.find.mockResolvedValue([]);
    const storage = fakeStorage();
    const handler = new CleanExpiredUploadsHandler(
      { getRepository: () => repo } as never,
      storage,
      fakeConfig(),
    );

    await handler.handle({}, { jobId: '1', attempt: 1 });

    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
