import type { PatchesApi } from '@patches/client';
import { describe, expect, it, vi } from 'vitest';

import { resolveMediaUrl } from './image.js';

type MediaClient = PatchesApi['media'];

function fakeMediaClient(
  getMediaDownload?: (req: { mediaId: string }) => Promise<{ downloadUrl?: string }>,
): MediaClient {
  return {
    getMediaDownload: vi.fn(
      getMediaDownload ??
        (({ mediaId }) => Promise.resolve({ downloadUrl: `https://media.example.com/${mediaId}.png` })),
    ),
  } as unknown as MediaClient;
}

describe('resolveMediaUrl', () => {
  it('resolves valid http/https download URLs', async () => {
    const media = fakeMediaClient();
    const url = await resolveMediaUrl(media, 'media-123');
    expect(url).toBe('https://media.example.com/media-123.png');
    expect(media.getMediaDownload).toHaveBeenCalledWith({ mediaId: 'media-123' });
  });

  it('returns null when mediaId is empty', async () => {
    const media = fakeMediaClient();
    const url = await resolveMediaUrl(media, '');
    expect(url).toBeNull();
    expect(media.getMediaDownload).not.toHaveBeenCalled();
  });

  it('returns null when API returns an invalid or non-http(s) scheme URL', async () => {
    const media = fakeMediaClient(() => Promise.resolve({ downloadUrl: 'javascript:alert(1)' }));
    const url = await resolveMediaUrl(media, 'media-bad');
    expect(url).toBeNull();
  });

  it('returns null when API returns an unsafe URL with ANSI escape sequences', async () => {
    const ESC = String.fromCodePoint(0x1b);
    const media = fakeMediaClient(() =>
      Promise.resolve({ downloadUrl: `https://media.example.com/${ESC}[31mimage.png` }),
    );
    const url = await resolveMediaUrl(media, 'media-unsafe');
    expect(url).toBeNull();
  });

  it('returns null when API call throws an error', async () => {
    const media = fakeMediaClient(() => Promise.reject(new Error('Network failure')));
    const url = await resolveMediaUrl(media, 'media-error');
    expect(url).toBeNull();
  });
});
