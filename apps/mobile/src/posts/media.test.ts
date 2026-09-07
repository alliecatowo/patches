import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema, PostSchema } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import { extractPostMediaViews } from './media.js';

describe('extractPostMediaViews', () => {
  it('returns empty array when post has no media', () => {
    const post = create(PostSchema, { media: [] });
    expect(extractPostMediaViews(post)).toEqual([]);
  });

  it('returns empty array when post media is undefined', () => {
    expect(extractPostMediaViews({})).toEqual([]);
  });

  it('extracts media views and sorts by position', () => {
    const media1 = create(MediaAttachmentSchema, {
      mediaId: 'media-1',
      altText: 'First photo',
      position: 1,
    });
    const media0 = create(MediaAttachmentSchema, {
      mediaId: 'media-0',
      altText: 'Cover photo',
      position: 0,
    });

    const post = create(PostSchema, {
      media: [media1, media0],
    });

    const views = extractPostMediaViews(post);
    expect(views).toEqual([
      { mediaId: 'media-0', altText: 'Cover photo', position: 0 },
      { mediaId: 'media-1', altText: 'First photo', position: 1 },
    ]);
  });

  it('ignores items with empty mediaId', () => {
    const valid = create(MediaAttachmentSchema, {
      mediaId: 'media-valid',
      altText: 'Valid image',
      position: 0,
    });
    const invalid = create(MediaAttachmentSchema, {
      mediaId: '',
      altText: 'Invalid image',
      position: 1,
    });

    const post = create(PostSchema, {
      media: [valid, invalid],
    });

    expect(extractPostMediaViews(post)).toEqual([
      { mediaId: 'media-valid', altText: 'Valid image', position: 0 },
    ]);
  });
});
