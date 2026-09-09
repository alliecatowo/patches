import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema, PostSchema } from '@patches/proto/es';
import { describe, expect, it, vi } from 'vitest';

import { getPostMediaAttachments, resolveMediaUrl } from './attachment.js';

describe('getPostMediaAttachments', () => {
  it('returns empty array when post has no media', () => {
    const post = create(PostSchema, { id: 'p1', media: [] });
    expect(getPostMediaAttachments(post)).toEqual([]);
  });

  it('returns media attachments when present on an active post', () => {
    const media = [
      create(MediaAttachmentSchema, { mediaId: 'm1', altText: 'An image', position: 0 }),
      create(MediaAttachmentSchema, { mediaId: 'm2', altText: 'Another image', position: 1 }),
    ];
    const post = create(PostSchema, { id: 'p1', media });
    expect(getPostMediaAttachments(post)).toEqual(media);
  });

  it('returns empty array when post is deleted even if media field is populated', () => {
    const media = [create(MediaAttachmentSchema, { mediaId: 'm1', position: 0 })];
    const post = create(PostSchema, { id: 'p1', deleted: true, media });
    expect(getPostMediaAttachments(post)).toEqual([]);
  });
});

describe('resolveMediaUrl', () => {
  it('returns safe download URL when API call succeeds', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      downloadUrl: 'https://r2.example.com/media/m1.png',
    });

    const url = await resolveMediaUrl('m1', fetchFn);
    expect(fetchFn).toHaveBeenCalledWith({ mediaId: 'm1' });
    expect(url).toBe('https://r2.example.com/media/m1.png');
  });

  it('returns null when API returns a non-http/https URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      downloadUrl: 'javascript:alert(1)',
    });

    const url = await resolveMediaUrl('m1', fetchFn);
    expect(url).toBeNull();
  });

  it('returns null when API returns URL with control/unsafe characters', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      downloadUrl: 'https://r2.example.com/media/m1.png\x00',
    });

    const url = await resolveMediaUrl('m1', fetchFn);
    expect(url).toBeNull();
  });

  it('returns null when API call rejects', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network error'));

    const url = await resolveMediaUrl('m1', fetchFn);
    expect(url).toBeNull();
  });
});
