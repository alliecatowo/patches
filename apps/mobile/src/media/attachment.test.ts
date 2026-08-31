import type { PatchesApi } from '@patches/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSafeMediaUrl } from './attachment.js';

type MediaClient = PatchesApi['media'];

function fakeMedia(overrides: Partial<MediaClient> = {}): MediaClient {
  return {
    getMediaDownload: vi.fn().mockResolvedValue({
      downloadUrl: 'https://r2.example.com/media-1.png',
    }),
    ...overrides,
  } as unknown as MediaClient;
}

describe('fetchSafeMediaUrl', () => {
  it('returns safe http(s) download url from getMediaDownload', async () => {
    const media = fakeMedia();
    const url = await fetchSafeMediaUrl(media, 'media-1');
    expect(url).toBe('https://r2.example.com/media-1.png');
    expect(media.getMediaDownload).toHaveBeenCalledWith({ mediaId: 'media-1' });
  });

  it('returns null if downloadUrl is empty or missing', async () => {
    const media = fakeMedia({
      getMediaDownload: vi.fn().mockResolvedValue({ downloadUrl: '' }),
    });
    const url = await fetchSafeMediaUrl(media, 'media-1');
    expect(url).toBeNull();
  });

  it('returns null if getMediaDownload throws an error', async () => {
    const media = fakeMedia({
      getMediaDownload: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    const url = await fetchSafeMediaUrl(media, 'media-1');
    expect(url).toBeNull();
  });

  it('returns null if downloadUrl is unsafe (non-http/https)', async () => {
    const media = fakeMedia({
      getMediaDownload: vi.fn().mockResolvedValue({ downloadUrl: 'javascript:alert(1)' }),
    });
    const url = await fetchSafeMediaUrl(media, 'media-1');
    expect(url).toBeNull();
  });
});
