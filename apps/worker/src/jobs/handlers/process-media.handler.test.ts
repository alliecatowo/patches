import type { Media } from '@patches/database';
import type { DownloadedObject, StorageClient } from '@patches/media';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AppConfigService } from '../../config/app-config.service.js';
import { ProcessMediaHandler } from './process-media.handler.js';

const MEDIA_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

function fakeConfig(): AppConfigService {
  return {
    mediaMaxBytes: 10 * 1024 * 1024,
    mediaMaxPixels: 20_000_000,
  } as AppConfigService;
}

interface FakeRepo {
  findOne: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

function fakeDataSource(repo: FakeRepo): { getRepository: () => FakeRepo } {
  return { getRepository: () => repo };
}

function pendingMedia(overrides: Partial<Media> = {}): Media {
  return {
    id: MEDIA_ID,
    ownerActorId: 'actor-1',
    state: 'PROCESSING',
    sourceObjectKey: null,
    displayObjectKey: null,
    thumbnailObjectKey: null,
    mimeType: null,
    width: null,
    height: null,
    byteSize: null,
    altText: null,
    contentHash: null,
    createdAt: new Date(),
    processedAt: null,
    deletedAt: null,
    ...overrides,
  } as Media;
}

async function pngFixture(width = 100, height = 80): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .png()
    .toBuffer();
}

function storageWith(body: Buffer, contentType = 'image/png'): StorageClient {
  const downloaded: DownloadedObject = { body, contentType, contentLength: body.byteLength };
  return {
    presignPut: vi.fn(),
    presignGet: vi.fn(),
    head: vi.fn(),
    getObject: vi.fn().mockResolvedValue(downloaded),
    putObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn(),
  };
}

describe('ProcessMediaHandler', () => {
  let repo: FakeRepo;

  beforeEach(() => {
    repo = { findOne: vi.fn(), update: vi.fn().mockResolvedValue({ affected: 1 }) };
  });

  it('is a no-op when the media row no longer exists', async () => {
    repo.findOne.mockResolvedValue(null);
    const storage = storageWith(await pngFixture());
    const handler = new ProcessMediaHandler(fakeDataSource(repo) as never, storage, fakeConfig());

    await handler.handle({ mediaId: MEDIA_ID }, { jobId: '1', attempt: 1 });

    expect(repo.update).not.toHaveBeenCalled();
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('is a no-op when the row is already terminal (READY/FAILED) — redelivery safe', async () => {
    repo.findOne.mockResolvedValue(pendingMedia({ state: 'READY' }));
    const storage = storageWith(await pngFixture());
    const handler = new ProcessMediaHandler(fakeDataSource(repo) as never, storage, fakeConfig());

    await handler.handle({ mediaId: MEDIA_ID }, { jobId: '1', attempt: 1 });

    expect(storage.getObject).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('processes a valid PNG: derivatives uploaded, row marked READY with real dimensions', async () => {
    const bytes = await pngFixture(120, 90);
    repo.findOne.mockResolvedValue(pendingMedia());
    const storage = storageWith(bytes);
    const handler = new ProcessMediaHandler(fakeDataSource(repo) as never, storage, fakeConfig());

    await handler.handle({ mediaId: MEDIA_ID }, { jobId: '1', attempt: 1 });

    expect(storage.putObject).toHaveBeenCalledTimes(2);
    const [displayCall, thumbCall] = (storage.putObject as ReturnType<typeof vi.fn>).mock.calls as [
      [string, Buffer, { contentType: string }],
      [string, Buffer, { contentType: string }],
    ];
    expect(displayCall[0]).toBe(`media/${MEDIA_ID}/v/display`);
    expect(thumbCall[0]).toBe(`media/${MEDIA_ID}/v/thumb`);
    expect(displayCall[2].contentType).toBe('image/webp');

    expect(repo.update).toHaveBeenCalledWith(
      { id: MEDIA_ID },
      expect.objectContaining({
        state: 'READY',
        mimeType: 'image/png',
        width: 120,
        height: 90,
        sourceObjectKey: `media/${MEDIA_ID}/original`,
        displayObjectKey: `media/${MEDIA_ID}/v/display`,
        thumbnailObjectKey: `media/${MEDIA_ID}/v/thumb`,
      }),
    );
  });

  it('accepts a matching expectedSha256 and processes normally', async () => {
    const bytes = await pngFixture();
    const { createHash } = await import('node:crypto');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    repo.findOne.mockResolvedValue(pendingMedia());
    const storage = storageWith(bytes);
    const handler = new ProcessMediaHandler(fakeDataSource(repo) as never, storage, fakeConfig());

    await handler.handle({ mediaId: MEDIA_ID, expectedSha256: sha256 }, { jobId: '1', attempt: 1 });

    expect(repo.update).toHaveBeenCalledWith(
      { id: MEDIA_ID },
      expect.objectContaining({ state: 'READY' }),
    );
  });

  it('marks the row FAILED when the downloaded bytes do not match expectedSha256', async () => {
    const bytes = await pngFixture();
    repo.findOne.mockResolvedValue(pendingMedia());
    const storage = storageWith(bytes);
    const handler = new ProcessMediaHandler(fakeDataSource(repo) as never, storage, fakeConfig());

    await handler.handle(
      { mediaId: MEDIA_ID, expectedSha256: '0'.repeat(64) },
      { jobId: '1', attempt: 1 },
    );

    expect(repo.update).toHaveBeenCalledWith(
      { id: MEDIA_ID },
      expect.objectContaining({ state: 'FAILED' }),
    );
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('marks the row FAILED (not a thrown job error) for an unsupported format', async () => {
    // A GIF signature — real format detection, not client-declared type (spec §31).
    const gifBytes = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#ff0000' },
    })
      .gif()
      .toBuffer();
    repo.findOne.mockResolvedValue(pendingMedia());
    const storage = storageWith(gifBytes, 'image/gif');
    const handler = new ProcessMediaHandler(fakeDataSource(repo) as never, storage, fakeConfig());

    await handler.handle({ mediaId: MEDIA_ID }, { jobId: '1', attempt: 1 });

    expect(repo.update).toHaveBeenCalledWith(
      { id: MEDIA_ID },
      expect.objectContaining({ state: 'FAILED' }),
    );
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('marks the row FAILED for bytes that are not a decodable image at all', async () => {
    repo.findOne.mockResolvedValue(pendingMedia());
    const storage = storageWith(Buffer.from('not an image, just text bytes padded out a bit'));
    const handler = new ProcessMediaHandler(fakeDataSource(repo) as never, storage, fakeConfig());

    await handler.handle({ mediaId: MEDIA_ID }, { jobId: '1', attempt: 1 });

    expect(repo.update).toHaveBeenCalledWith(
      { id: MEDIA_ID },
      expect.objectContaining({ state: 'FAILED' }),
    );
  });

  it('rethrows an infra error (storage download failure) so the job retries', async () => {
    repo.findOne.mockResolvedValue(pendingMedia());
    const storage = storageWith(await pngFixture());
    (storage.getObject as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network blip'));
    const handler = new ProcessMediaHandler(fakeDataSource(repo) as never, storage, fakeConfig());

    await expect(handler.handle({ mediaId: MEDIA_ID }, { jobId: '1', attempt: 1 })).rejects.toThrow(
      'network blip',
    );
    expect(repo.update).not.toHaveBeenCalled();
  });
});
