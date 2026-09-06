import { create } from '@bufbuild/protobuf';
import { GetMediaDownloadResponseSchema } from '@patches/proto/es';
import { describe, expect, it, vi } from 'vitest';

import { resolveMediaDownloadUrl } from './attachment.js';

describe('resolveMediaDownloadUrl', () => {
  it('returns null if mediaId is empty', async () => {
    const result = await resolveMediaDownloadUrl({ mediaId: '' });
    expect(result).toBeNull();
  });

  it('resolves valid http/https download URL', async () => {
    const mockGetMediaDownload = vi.fn().mockResolvedValue(
      create(GetMediaDownloadResponseSchema, {
        downloadUrl: 'https://r2.patches.social/image.jpg',
      }),
    );

    const result = await resolveMediaDownloadUrl({
      mediaId: 'm123',
      getMediaDownload: mockGetMediaDownload,
    });

    expect(mockGetMediaDownload).toHaveBeenCalledWith({ mediaId: 'm123' });
    expect(result).toBe('https://r2.patches.social/image.jpg');
  });

  it('rejects non-http/https URLs (e.g. javascript: or file:)', async () => {
    const mockGetMediaDownload = vi.fn().mockResolvedValue(
      create(GetMediaDownloadResponseSchema, {
        downloadUrl: 'file:///etc/passwd',
      }),
    );

    const result = await resolveMediaDownloadUrl({
      mediaId: 'm123',
      getMediaDownload: mockGetMediaDownload,
    });

    expect(result).toBeNull();
  });

  it('returns null when API call fails', async () => {
    const mockGetMediaDownload = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await resolveMediaDownloadUrl({
      mediaId: 'm123',
      getMediaDownload: mockGetMediaDownload,
    });

    expect(result).toBeNull();
  });
});
