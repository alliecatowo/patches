import type { PatchesApi } from '@patches/client';
import { describe, expect, it, vi } from 'vitest';

import { resolveMediaDownloadUrl } from './attachment.js';

type MediaClient = PatchesApi['media'];

function fakeMedia(overrides: Partial<Pick<MediaClient, 'getMediaDownload'>> = {}): MediaClient {
  const beginMediaUpload = vi.fn();
  const finalizeMediaUpload = vi.fn();
  const getMediaDownload = overrides.getMediaDownload ?? vi.fn();

  return {
    getMediaDownload,
    beginMediaUpload,
    finalizeMediaUpload,
  };
}

describe('resolveMediaDownloadUrl', () => {
  it('resolves valid http/https download URLs successfully', async () => {
    const getMediaDownload = vi
      .fn()
      .mockResolvedValue({ downloadUrl: 'https://cdn.example.com/image.png' });
    const media = fakeMedia({ getMediaDownload });

    const result = await resolveMediaDownloadUrl(media, 'media-123');
    expect(result).toBe('https://cdn.example.com/image.png');
    expect(getMediaDownload).toHaveBeenCalledWith({ mediaId: 'media-123' });
  });

  it('rejects unsafe or non-http(s) download URLs', async () => {
    const getMediaDownload = vi.fn().mockResolvedValue({ downloadUrl: 'javascript:alert(1)' });
    const media = fakeMedia({ getMediaDownload });

    const result = await resolveMediaDownloadUrl(media, 'media-unsafe');
    expect(result).toBeNull();
  });

  it('handles API errors gracefully and returns null', async () => {
    const getMediaDownload = vi.fn().mockRejectedValue(new Error('Network error'));
    const media = fakeMedia({ getMediaDownload });

    const result = await resolveMediaDownloadUrl(media, 'media-err');
    expect(result).toBeNull();
  });
});
