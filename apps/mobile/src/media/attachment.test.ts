import type { PatchesApi } from '@patches/client';
import { describe, expect, it, vi } from 'vitest';
import { resolveMediaDownloadUrl } from './attachment.js';

describe('resolveMediaDownloadUrl', () => {
  it('returns safe http/https download URL when media download resolves', async () => {
    const mockMediaClient = {
      getMediaDownload: vi.fn().mockResolvedValue({
        downloadUrl: 'https://r2.example.com/media/test-123.jpg',
      }),
    } as unknown as PatchesApi['media'];

    const url = await resolveMediaDownloadUrl(mockMediaClient, 'test-123');
    expect(url).toBe('https://r2.example.com/media/test-123.jpg');
    expect(mockMediaClient.getMediaDownload).toHaveBeenCalledWith({ mediaId: 'test-123' });
  });

  it('returns null when downloadUrl is unsafe or non-http(s)', async () => {
    const mockMediaClient = {
      getMediaDownload: vi.fn().mockResolvedValue({
        downloadUrl: 'javascript:alert(1)',
      }),
    } as unknown as PatchesApi['media'];

    const url = await resolveMediaDownloadUrl(mockMediaClient, 'test-123');
    expect(url).toBeNull();
  });

  it('returns null when downloadUrl contains control characters', async () => {
    const mockMediaClient = {
      getMediaDownload: vi.fn().mockResolvedValue({
        downloadUrl: 'https://r2.example.com/media/test.jpg\x00',
      }),
    } as unknown as PatchesApi['media'];

    const url = await resolveMediaDownloadUrl(mockMediaClient, 'test-123');
    expect(url).toBeNull();
  });

  it('returns null when getMediaDownload rejects', async () => {
    const mockMediaClient = {
      getMediaDownload: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as PatchesApi['media'];

    const url = await resolveMediaDownloadUrl(mockMediaClient, 'test-123');
    expect(url).toBeNull();
  });
});
