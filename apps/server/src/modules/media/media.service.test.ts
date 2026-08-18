import { Media, OutboxJob } from '@patches/database';
import type { StorageClient } from '@patches/media';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isAppError } from '../../common/errors/app-error.js';
import { type AppConfigService } from '../../config/app-config.service.js';
import { RateLimitService } from '../auth/rate-limit.service.js';
import { MediaService } from './media.service.js';

const ACTOR_ID = 'actor-1';
const MEDIA_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const VALID_SHA256 = '1'.repeat(64);

function fakeConfig(): AppConfigService {
  return {
    mediaPresignPutTtlSeconds: 300,
    mediaPresignGetTtlSeconds: 600,
  } as AppConfigService;
}

function fakeStorage(): StorageClient {
  return {
    presignPut: vi.fn().mockResolvedValue({ url: 'https://put.example', expiresAt: new Date() }),
    presignGet: vi.fn().mockResolvedValue({ url: 'https://get.example', expiresAt: new Date() }),
    head: vi.fn(),
    getObject: vi.fn(),
    putObject: vi.fn(),
    deleteObject: vi.fn(),
  };
}

interface FakeMediaRepo {
  create: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findOneByOrFail: ReturnType<typeof vi.fn>;
}

interface FakeJobsRepo {
  create: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
}

function fakeDataSource(mediaRepo: FakeMediaRepo, jobsRepo: FakeJobsRepo): unknown {
  const getRepository = (entity: unknown): unknown => {
    if (entity === Media) return mediaRepo;
    if (entity === OutboxJob) return jobsRepo;
    throw new Error('unexpected entity');
  };
  return {
    getRepository,
    transaction: (fn: (manager: { getRepository: typeof getRepository }) => unknown) =>
      fn({ getRepository }),
  };
}

function newMediaRepo(): FakeMediaRepo {
  return {
    create: vi.fn((partial: unknown) => partial),
    save: vi.fn().mockResolvedValue(undefined),
    findOne: vi.fn(),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    findOneByOrFail: vi.fn(),
  };
}

function newJobsRepo(): FakeJobsRepo {
  return {
    create: vi.fn((partial: unknown) => partial),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe('MediaService.beginMediaUpload', () => {
  let mediaRepo: FakeMediaRepo;
  let jobsRepo: FakeJobsRepo;
  let storage: StorageClient;
  let rateLimit: RateLimitService;

  beforeEach(() => {
    mediaRepo = newMediaRepo();
    jobsRepo = newJobsRepo();
    storage = fakeStorage();
    rateLimit = new RateLimitService();
  });

  function service(): MediaService {
    return new MediaService(
      fakeDataSource(mediaRepo, jobsRepo) as never,
      storage,
      fakeConfig(),
      rateLimit,
    );
  }

  it('presigns a PUT pinned to the validated content type/size and creates a PENDING_UPLOAD row', async () => {
    const result = await service().beginMediaUpload({
      actorId: ACTOR_ID,
      mimeType: 'image/png',
      byteSize: 2048,
      sha256: VALID_SHA256,
    });

    expect(result.uploadUrl).toBe('https://put.example');
    const [key, options] = (storage.presignPut as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { contentType: string; contentLength: number; expiresInSeconds: number },
    ];
    expect(key).toBe(`media/${result.mediaId}/original`);
    expect(options).toMatchObject({
      contentType: 'image/png',
      contentLength: 2048,
      expiresInSeconds: 300,
    });

    expect(mediaRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerActorId: ACTOR_ID,
        state: 'PENDING_UPLOAD',
        contentHash: VALID_SHA256,
      }),
    );
  });

  it('rejects an unsupported content type before ever calling presignPut', async () => {
    await expect(
      service().beginMediaUpload({
        actorId: ACTOR_ID,
        mimeType: 'image/gif',
        byteSize: 2048,
        sha256: VALID_SHA256,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'MEDIA_UNSUPPORTED_TYPE',
    );
    expect(storage.presignPut).not.toHaveBeenCalled();
  });

  it('rate-limits repeated calls from the same actor', async () => {
    const svc = service();
    const input = {
      actorId: ACTOR_ID,
      mimeType: 'image/png',
      byteSize: 1024,
      sha256: VALID_SHA256,
    };

    // WINDOWS.media_begin_upload allows 30 per 5 minutes (rate-limit.service.ts) — drive it
    // past that budget rather than hard-coding the exact number here twice.
    await expect(
      (async () => {
        for (let i = 0; i < 40; i += 1) {
          await svc.beginMediaUpload(input);
        }
      })(),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'RATE_LIMITED');
  });
});

describe('MediaService.finalizeMediaUpload', () => {
  let mediaRepo: FakeMediaRepo;
  let jobsRepo: FakeJobsRepo;
  let storage: StorageClient;

  beforeEach(() => {
    mediaRepo = newMediaRepo();
    jobsRepo = newJobsRepo();
    storage = fakeStorage();
  });

  function service(): MediaService {
    return new MediaService(
      fakeDataSource(mediaRepo, jobsRepo) as never,
      storage,
      fakeConfig(),
      new RateLimitService(),
    );
  }

  function pendingRow(overrides: Partial<Media> = {}): Media {
    return {
      id: MEDIA_ID,
      ownerActorId: ACTOR_ID,
      state: 'PENDING_UPLOAD',
      contentHash: VALID_SHA256,
      ...overrides,
    } as Media;
  }

  it('HEADs the object, flips PENDING_UPLOAD -> PROCESSING, and enqueues PROCESS_MEDIA', async () => {
    mediaRepo.findOne.mockResolvedValue(pendingRow());
    (storage.head as ReturnType<typeof vi.fn>).mockResolvedValue({
      contentType: 'image/png',
      contentLength: 2048,
      etag: '"abc"',
    });

    const result = await service().finalizeMediaUpload(ACTOR_ID, MEDIA_ID);

    expect(result).toEqual({ mediaId: MEDIA_ID, state: 'PROCESSING' });
    expect(mediaRepo.update).toHaveBeenCalledWith(
      { id: MEDIA_ID, state: 'PENDING_UPLOAD' },
      { state: 'PROCESSING' },
    );
    expect(jobsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PROCESS_MEDIA',
        payload: { mediaId: MEDIA_ID, expectedSha256: VALID_SHA256 },
        idempotencyKey: `PROCESS_MEDIA:${MEDIA_ID}`,
      }),
    );
  });

  it('rejects a media id owned by someone else with MEDIA_NOT_FOUND', async () => {
    mediaRepo.findOne.mockResolvedValue(pendingRow({ ownerActorId: 'someone-else' }));

    await expect(service().finalizeMediaUpload(ACTOR_ID, MEDIA_ID)).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'MEDIA_NOT_FOUND',
    );
    expect(storage.head).not.toHaveBeenCalled();
  });

  it('is idempotent: re-finalizing an already-PROCESSING row just reports its state', async () => {
    mediaRepo.findOne.mockResolvedValue(pendingRow({ state: 'PROCESSING' }));

    const result = await service().finalizeMediaUpload(ACTOR_ID, MEDIA_ID);

    expect(result).toEqual({ mediaId: MEDIA_ID, state: 'PROCESSING' });
    expect(storage.head).not.toHaveBeenCalled();
    expect(jobsRepo.save).not.toHaveBeenCalled();
  });

  it('rejects when the client never actually uploaded the object', async () => {
    mediaRepo.findOne.mockResolvedValue(pendingRow());
    (storage.head as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service().finalizeMediaUpload(ACTOR_ID, MEDIA_ID)).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'VALIDATION_ERROR',
    );
    expect(mediaRepo.update).not.toHaveBeenCalled();
  });
});

describe('MediaService.getMediaDownload', () => {
  let mediaRepo: FakeMediaRepo;
  let jobsRepo: FakeJobsRepo;
  let storage: StorageClient;

  beforeEach(() => {
    mediaRepo = newMediaRepo();
    jobsRepo = newJobsRepo();
    storage = fakeStorage();
  });

  function service(): MediaService {
    return new MediaService(
      fakeDataSource(mediaRepo, jobsRepo) as never,
      storage,
      fakeConfig(),
      new RateLimitService(),
    );
  }

  function readyRow(overrides: Partial<Media> = {}): Media {
    return {
      id: MEDIA_ID,
      ownerActorId: ACTOR_ID,
      state: 'READY',
      mimeType: 'image/webp',
      width: 100,
      height: 80,
      displayObjectKey: `media/${MEDIA_ID}/v/display`,
      thumbnailObjectKey: `media/${MEDIA_ID}/v/thumb`,
      deletedAt: null,
      ...overrides,
    } as Media;
  }

  it('returns presigned display + thumbnail URLs for a READY row, for any caller', async () => {
    mediaRepo.findOne.mockResolvedValue(readyRow());

    const result = await service().getMediaDownload(MEDIA_ID);

    expect(result.downloadUrl).toBe('https://get.example');
    expect(result.thumbnailUrl).toBe('https://get.example');
    expect(result.mimeType).toBe('image/webp');
    expect(storage.presignGet).toHaveBeenCalledWith(`media/${MEDIA_ID}/v/display`, {
      expiresInSeconds: 600,
    });
  });

  it('rejects a not-yet-READY row with MEDIA_NOT_READY', async () => {
    mediaRepo.findOne.mockResolvedValue(readyRow({ state: 'PROCESSING' }));

    await expect(service().getMediaDownload(MEDIA_ID)).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'MEDIA_NOT_READY',
    );
  });

  it('rejects an unknown media id with MEDIA_NOT_FOUND', async () => {
    mediaRepo.findOne.mockResolvedValue(null);

    await expect(service().getMediaDownload(MEDIA_ID)).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'MEDIA_NOT_FOUND',
    );
  });
});
