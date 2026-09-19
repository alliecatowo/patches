import type { GetMediaDownloadResponse } from '@patches/proto/es';
import type { PatchesApi } from '@patches/client';
import { describe, expect, it, vi } from 'vitest';
import { fetchSafeMediaDownloadUrl } from './download.js';

type MediaClient = PatchesApi['media'];

function fakeMedia(
  getMediaDownloadImpl: (req: { mediaId: string }) => Promise<GetMediaDownloadResponse>,
): MediaClient {
  return {
    getMediaDownload: vi.fn(getMediaDownloadImpl),
  } as unknown as MediaClient;
}

describe('fetchSafeMediaDownloadUrl', () => {
  it('returns valid http/https download URLs', async () => {
    const media = fakeMedia(() =>
      Promise.resolve({
        mediaId: 'm1',
        downloadUrl: 'https://r2.example/image.png',
      } as GetMediaDownloadResponse),
    );

    const url = await fetchSafeMediaDownloadUrl(media, 'm1');
    expect(url).toBe('https://r2.example/image.png');
    expect(media.getMediaDownload).toHaveBeenCalledWith({ mediaId: 'm1' });
  });

  it('rejects missing or empty download URLs', async () => {
    const media = fakeMedia(() =>
      Promise.resolve({
        mediaId: 'm1',
        downloadUrl: '',
      } as GetMediaDownloadResponse),
    );

    const url = await fetchSafeMediaDownloadUrl(media, 'm1');
    expect(url).toBeNull();
  });

  it('rejects unsafe URL schemes (e.g. javascript:, file:)', async () => {
    const mediaJavascript = fakeMedia(() =>
      Promise.resolve({
        mediaId: 'm1',
        downloadUrl: 'javascript:alert(1)',
      } as GetMediaDownloadResponse),
    );

    const mediaFile = fakeMedia(() =>
      Promise.resolve({
        mediaId: 'm1',
        downloadUrl: 'file:///etc/passwd',
      } as GetMediaDownloadResponse),
    );

    expect(await fetchSafeMediaDownloadUrl(mediaJavascript, 'm1')).toBeNull();
    expect(await fetchSafeMediaDownloadUrl(mediaFile, 'm1')).toBeNull();
  });

  it('rejects URLs containing control characters or unsafe bytes', async () => {
    const media = fakeMedia(() =>
      Promise.resolve({
        mediaId: 'm1',
        downloadUrl: 'https://r2.example/image.png\x00',
      } as GetMediaDownloadResponse),
    );

    const url = await fetchSafeMediaDownloadUrl(media, 'm1');
    expect(url).toBeNull();
  });

  it('returns null when the API request throws', async () => {
    const media = fakeMedia(() => Promise.reject(new Error('Network error')));

    const url = await fetchSafeMediaDownloadUrl(media, 'm1');
    expect(url).toBeNull();
  });
});
