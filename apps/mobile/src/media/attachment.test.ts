import { create } from '@bufbuild/protobuf';
import type { PatchesApi } from '@patches/client';
import { MediaAttachmentSchema, PostSchema } from '@patches/proto/es';
import { describe, expect, it, vi } from 'vitest';

import { getPostMediaAttachments, resolveMediaUrl } from './attachment.js';

describe('getPostMediaAttachments', () => {
  it('returns empty array when post has no media or is deleted', () => {
    const postWithNoMedia = create(PostSchema, { id: 'p1', body: 'hello' });
    expect(getPostMediaAttachments(postWithNoMedia)).toEqual([]);

    const deletedPost = create(PostSchema, {
      id: 'p2',
      deleted: true,
      media: [create(MediaAttachmentSchema, { mediaId: 'm1', position: 0 })],
    });
    expect(getPostMediaAttachments(deletedPost)).toEqual([]);
  });

  it('returns media attachments sorted by position', () => {
    const m1 = create(MediaAttachmentSchema, { mediaId: 'm1', position: 1 });
    const m2 = create(MediaAttachmentSchema, { mediaId: 'm2', position: 0 });
    const post = create(PostSchema, {
      id: 'p3',
      media: [m1, m2],
    });

    const result = getPostMediaAttachments(post);
    expect(result.map((m) => m.mediaId)).toEqual(['m2', 'm1']);
  });
});

describe('resolveMediaUrl', () => {
  it('returns null for empty mediaId', async () => {
    const fakeApi = {} as PatchesApi;
    expect(await resolveMediaUrl(fakeApi, '')).toBeNull();
  });

  it('resolves and returns valid http/https download URL', async () => {
    const getMediaDownloadMock = vi.fn().mockResolvedValue({
      mediaId: 'm1',
      downloadUrl: 'https://r2.example.com/media/m1.png',
    });
    const fakeApi = {
      media: {
        getMediaDownload: getMediaDownloadMock,
      },
    } as unknown as PatchesApi;

    const url = await resolveMediaUrl(fakeApi, 'm1');
    expect(url).toBe('https://r2.example.com/media/m1.png');
    expect(getMediaDownloadMock).toHaveBeenCalledWith({ mediaId: 'm1' });
  });

  it('rejects unsafe or non-http URLs', async () => {
    const getMediaDownloadMock = vi.fn().mockResolvedValue({
      mediaId: 'm1',
      downloadUrl: 'javascript:alert(1)',
    });
    const fakeApi = {
      media: {
        getMediaDownload: getMediaDownloadMock,
      },
    } as unknown as PatchesApi;

    const url = await resolveMediaUrl(fakeApi, 'm1');
    expect(url).toBeNull();
  });

  it('returns null when API call fails', async () => {
    const getMediaDownloadMock = vi.fn().mockRejectedValue(new Error('Network error'));
    const fakeApi = {
      media: {
        getMediaDownload: getMediaDownloadMock,
      },
    } as unknown as PatchesApi;

    const url = await resolveMediaUrl(fakeApi, 'm1');
    expect(url).toBeNull();
  });
});
