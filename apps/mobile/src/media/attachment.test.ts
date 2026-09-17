import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema, PostSchema } from '@patches/proto/es';
import { describe, expect, it, vi } from 'vitest';

import { getPostMediaAttachments, resolveMediaDownloadUrl } from './attachment.js';

describe('getPostMediaAttachments', () => {
  it('returns empty array when post has no media attachments', () => {
    const post = create(PostSchema, { id: 'post-1' });
    expect(getPostMediaAttachments(post)).toEqual([]);
  });

  it('extracts mediaId and altText from post.media', () => {
    const post = create(PostSchema, {
      id: 'post-1',
      media: [
        create(MediaAttachmentSchema, { mediaId: 'm-1', altText: 'A sunny cat' }),
        create(MediaAttachmentSchema, { mediaId: 'm-2', altText: '' }),
      ],
    });

    expect(getPostMediaAttachments(post)).toEqual([
      { mediaId: 'm-1', altText: 'A sunny cat' },
      { mediaId: 'm-2', altText: '' },
    ]);
  });
});

describe('resolveMediaDownloadUrl', () => {
  it('returns safe download URL when API call succeeds', async () => {
    const mediaClient = {
      getMediaDownload: vi
        .fn()
        .mockResolvedValue({ downloadUrl: 'https://media.example.com/img1.png' }),
    };

    const url = await resolveMediaDownloadUrl(mediaClient, 'm-1');
    expect(url).toBe('https://media.example.com/img1.png');
    expect(mediaClient.getMediaDownload).toHaveBeenCalledWith({ mediaId: 'm-1' });
  });

  it('rejects unsafe link schemes (e.g. javascript:, file:)', async () => {
    const mediaClient = {
      getMediaDownload: vi.fn().mockResolvedValue({ downloadUrl: 'javascript:alert(1)' }),
    };

    const url = await resolveMediaDownloadUrl(mediaClient, 'm-1');
    expect(url).toBeNull();
  });

  it('returns null on API failure', async () => {
    const mediaClient = {
      getMediaDownload: vi.fn().mockRejectedValue(new Error('Network error')),
    };

    const url = await resolveMediaDownloadUrl(mediaClient, 'm-1');
    expect(url).toBeNull();
  });

  it('returns null if downloadUrl is empty', async () => {
    const mediaClient = {
      getMediaDownload: vi.fn().mockResolvedValue({ downloadUrl: '' }),
    };

    const url = await resolveMediaDownloadUrl(mediaClient, 'm-1');
    expect(url).toBeNull();
  });
});
