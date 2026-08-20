import { MediaStatus, type GetMediaDownloadResponse } from '@patches/proto/es';
import type { PatchesApi } from '@patches/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.mock` is hoisted above imports by vitest, so `expo-crypto`'s real native digest
// implementation (unavailable under Vitest's `node` environment) never runs — a fixed,
// obviously-fake digest is enough since these tests assert wiring, not hash correctness.
vi.mock('expo-crypto', () => ({
  digest: vi.fn(() => Promise.resolve(new Uint8Array([0xab, 0xcd]).buffer)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

import { pollMediaUntilReady, sha256Hex, uploadMediaBytes } from './upload.js';

type MediaClient = PatchesApi['media'];

/** A hand-typed stand-in for the generated Connect `MediaService` client — only the three
 * methods `media/upload.ts` actually calls are given real behavior; everything else is
 * `Client<typeof MediaService>`'s exact shape, so no `any` escapes this test file. */
function fakeMedia(overrides: Partial<Pick<MediaClient, 'getMediaDownload'>> = {}): MediaClient {
  const beginMediaUpload = vi.fn(() =>
    Promise.resolve({
      mediaId: 'media-1',
      uploadUrl: 'https://r2.example/upload',
      expiresAt: undefined,
    }),
  );
  const finalizeMediaUpload = vi.fn(() =>
    Promise.resolve({ mediaId: 'media-1', status: MediaStatus.PENDING }),
  );
  const getMediaDownload =
    overrides.getMediaDownload ??
    vi.fn<() => Promise<GetMediaDownloadResponse>>(() => {
      throw new Error('getMediaDownload not stubbed for this test');
    });
  return { beginMediaUpload, finalizeMediaUpload, getMediaDownload } as unknown as MediaClient;
}

describe('sha256Hex', () => {
  it('hex-encodes the digest bytes', async () => {
    await expect(sha256Hex(new Uint8Array([1, 2, 3]))).resolves.toBe('abcd');
  });
});

describe('uploadMediaBytes', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = originalFetch;
  });

  it('begins, PUTs to the presigned URL, and finalizes, returning the media id', async () => {
    const media = fakeMedia();
    const fetchMock: typeof fetch = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    global.fetch = fetchMock;

    const progress: number[] = [];
    const mediaId = await uploadMediaBytes(
      media,
      { bytes: new Uint8Array([1, 2, 3, 4]), mimeType: 'image/png' },
      (p) => progress.push(p.sentBytes),
    );

    expect(mediaId).toBe('media-1');
    expect(media.beginMediaUpload).toHaveBeenCalledWith({
      mimeType: 'image/png',
      byteSize: 4n,
      sha256: 'abcd',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://r2.example/upload',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(media.finalizeMediaUpload).toHaveBeenCalledWith({ mediaId: 'media-1' });
    expect(progress).toEqual([0, 4]);
  });

  it('throws when the presigned PUT fails', async () => {
    const media = fakeMedia();
    const fetchMock: typeof fetch = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 500 })),
    );
    global.fetch = fetchMock;

    await expect(
      uploadMediaBytes(media, { bytes: new Uint8Array([1]), mimeType: 'image/png' }),
    ).rejects.toThrow('Upload failed (HTTP 500).');
    expect(media.finalizeMediaUpload).not.toHaveBeenCalled();
  });
});

describe('pollMediaUntilReady', () => {
  it('returns as soon as the status is READY', async () => {
    const getMediaDownload = vi.fn<() => Promise<GetMediaDownloadResponse>>(() =>
      Promise.resolve({
        mediaId: 'media-1',
        status: MediaStatus.READY,
      } as GetMediaDownloadResponse),
    );
    const media = fakeMedia({ getMediaDownload });
    const response = await pollMediaUntilReady(media, 'media-1', { intervalMs: 1 });
    expect(response.status).toBe(MediaStatus.READY);
  });

  it('returns FAILED without retrying further', async () => {
    const getMediaDownload = vi.fn<() => Promise<GetMediaDownloadResponse>>(() =>
      Promise.resolve({
        mediaId: 'media-1',
        status: MediaStatus.FAILED,
      } as GetMediaDownloadResponse),
    );
    const media = fakeMedia({ getMediaDownload });
    const response = await pollMediaUntilReady(media, 'media-1', { intervalMs: 1 });
    expect(response.status).toBe(MediaStatus.FAILED);
    expect(getMediaDownload).toHaveBeenCalledTimes(1);
  });

  it('gives up at the timeout while still PROCESSING', async () => {
    const getMediaDownload = vi.fn<() => Promise<GetMediaDownloadResponse>>(() =>
      Promise.resolve({
        mediaId: 'media-1',
        status: MediaStatus.PROCESSING,
      } as GetMediaDownloadResponse),
    );
    const media = fakeMedia({ getMediaDownload });
    const response = await pollMediaUntilReady(media, 'media-1', {
      intervalMs: 1,
      timeoutMs: 5,
    });
    expect(response.status).toBe(MediaStatus.PROCESSING);
  });
});
