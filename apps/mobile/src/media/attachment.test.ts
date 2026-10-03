import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema, type GetMediaDownloadResponse } from '@patches/proto/es';
import type { PatchesApi } from '@patches/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveMediaDownloadUrl, resolvePostMediaAttachments } from './attachment.js';

type MediaClient = PatchesApi['media'];

function fakeMedia(overrides: Partial<Pick<MediaClient, 'getMediaDownload'>> = {}): MediaClient {
  const getMediaDownload =
    overrides.getMediaDownload ??
    vi.fn<() => Promise<GetMediaDownloadResponse>>(() => {
      throw new Error('getMediaDownload not stubbed for this test');
    });
  return { getMediaDownload } as unknown as MediaClient;
}

describe('resolveMediaDownloadUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves valid http/https URLs', async () => {
    const getMediaDownload = vi.fn<() => Promise<GetMediaDownloadResponse>>(() =>
      Promise.resolve({
        downloadUrl: 'https://cdn.example.com/image.jpg',
      } as GetMediaDownloadResponse),
    );
    const media = fakeMedia({ getMediaDownload });

    const url = await resolveMediaDownloadUrl(media, 'media-1');
    expect(url).toBe('https://cdn.example.com/image.jpg');
    expect(getMediaDownload).toHaveBeenCalledWith({ mediaId: 'media-1' });
  });

  it('returns null for unsafe or invalid URLs', async () => {
    const getMediaDownload = vi.fn<() => Promise<GetMediaDownloadResponse>>(() =>
      Promise.resolve({ downloadUrl: 'javascript:alert(1)' } as GetMediaDownloadResponse),
    );
    const media = fakeMedia({ getMediaDownload });

    const url = await resolveMediaDownloadUrl(media, 'media-1');
    expect(url).toBeNull();
  });

  it('returns null when RPC fails', async () => {
    const getMediaDownload = vi.fn<() => Promise<GetMediaDownloadResponse>>(() =>
      Promise.reject(new Error('RPC error')),
    );
    const media = fakeMedia({ getMediaDownload });

    const url = await resolveMediaDownloadUrl(media, 'media-1');
    expect(url).toBeNull();
  });
});

describe('resolvePostMediaAttachments', () => {
  it('resolves multiple attachments in parallel', async () => {
    const getMediaDownload = vi.fn<
      (req: { mediaId?: string }) => Promise<GetMediaDownloadResponse>
    >(({ mediaId }) => {
      if (mediaId === 'm1') {
        return Promise.resolve({
          downloadUrl: 'https://example.com/1.png',
        } as GetMediaDownloadResponse);
      }
      if (mediaId === 'm2') {
        return Promise.resolve({
          downloadUrl: 'file:///etc/passwd',
        } as GetMediaDownloadResponse);
      }
      return Promise.reject(new Error('not found'));
    });
    const media = fakeMedia({ getMediaDownload });

    const att1 = create(MediaAttachmentSchema, { mediaId: 'm1', altText: 'First image' });
    const att2 = create(MediaAttachmentSchema, { mediaId: 'm2', altText: 'Unsafe image' });
    const att3 = create(MediaAttachmentSchema, { mediaId: 'm3', altText: 'Missing image' });

    const results = await resolvePostMediaAttachments(media, [att1, att2, att3]);

    expect(results).toEqual([
      { mediaId: 'm1', altText: 'First image', url: 'https://example.com/1.png', failed: false },
      { mediaId: 'm2', altText: 'Unsafe image', url: null, failed: true },
      { mediaId: 'm3', altText: 'Missing image', url: null, failed: true },
    ]);
  });
});
