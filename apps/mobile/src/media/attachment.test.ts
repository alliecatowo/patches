import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema, PostSchema } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import { getPostMediaAttachments, resolveSafeMediaUrl } from './attachment.js';

describe('getPostMediaAttachments', () => {
  it('returns media attachments for a active post with media', () => {
    const mediaItem = create(MediaAttachmentSchema, {
      mediaId: 'media-1',
      altText: 'A test image',
    });
    const post = create(PostSchema, {
      id: 'post-1',
      body: 'Hello world',
      media: [mediaItem],
      deleted: false,
    });

    const attachments = getPostMediaAttachments(post);
    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.mediaId).toBe('media-1');
    expect(attachments[0]?.altText).toBe('A test image');
  });

  it('returns empty array when post is deleted', () => {
    const mediaItem = create(MediaAttachmentSchema, {
      mediaId: 'media-1',
      altText: 'A test image',
    });
    const post = create(PostSchema, {
      id: 'post-1',
      media: [mediaItem],
      deleted: true,
    });

    expect(getPostMediaAttachments(post)).toEqual([]);
  });

  it('returns empty array when post has no media', () => {
    const post = create(PostSchema, {
      id: 'post-1',
      body: 'No media here',
      media: [],
      deleted: false,
    });

    expect(getPostMediaAttachments(post)).toEqual([]);
  });
});

describe('resolveSafeMediaUrl', () => {
  it('accepts valid http and https URLs', () => {
    expect(resolveSafeMediaUrl('https://example.com/image.png')).toBe(
      'https://example.com/image.png',
    );
    expect(resolveSafeMediaUrl('http://example.com/image.jpg')).toBe(
      'http://example.com/image.jpg',
    );
  });

  it('rejects empty strings and invalid URLs', () => {
    expect(resolveSafeMediaUrl('')).toBeNull();
    expect(resolveSafeMediaUrl('not-a-url')).toBeNull();
  });

  it('rejects unsafe URL schemes like file, javascript, data', () => {
    expect(resolveSafeMediaUrl('javascript:alert(1)')).toBeNull();
    expect(resolveSafeMediaUrl('file:///etc/passwd')).toBeNull();
    expect(resolveSafeMediaUrl('data:image/png;base64,iVBORw0KGgo=')).toBeNull();
  });

  it('rejects URLs containing control characters', () => {
    expect(resolveSafeMediaUrl('https://example.com/image.png\x00')).toBeNull();
    expect(resolveSafeMediaUrl('https://example.com/\x1b[31mimage.png')).toBeNull();
  });
});
