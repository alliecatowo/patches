import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema, PostSchema } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import { safePageHref } from '../pages/href.js';

describe('PostRow media attachments data structure (B-084)', () => {
  it('constructs posts with media attachments correctly', () => {
    const mediaItem1 = create(MediaAttachmentSchema, {
      mediaId: 'media-1',
      altText: 'A cute cat',
      width: 800,
      height: 600,
    });
    const mediaItem2 = create(MediaAttachmentSchema, {
      mediaId: 'media-2',
      altText: 'A sunny beach',
      width: 1200,
      height: 900,
    });

    const post = create(PostSchema, {
      id: 'post-1',
      body: 'Check out these images!',
      media: [mediaItem1, mediaItem2],
    });

    expect(post.media).toHaveLength(2);
    expect(post.media[0].mediaId).toBe('media-1');
    expect(post.media[0].altText).toBe('A cute cat');
    expect(post.media[1].mediaId).toBe('media-2');
    expect(post.media[1].altText).toBe('A sunny beach');
  });

  it('validates media download URLs using safePageHref', () => {
    expect(safePageHref('https://r2.example.com/media-1.png')).toBe(
      'https://r2.example.com/media-1.png',
    );
    expect(safePageHref('http://r2.example.com/media-1.png')).toBe(
      'http://r2.example.com/media-1.png',
    );
    expect(safePageHref('javascript:alert(1)')).toBeNull();
    expect(safePageHref('file:///etc/passwd')).toBeNull();
  });
});
