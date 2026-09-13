import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema, PostSchema } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import { extractPostMedia, safeMediaUrl } from './attachment.js';

describe('extractPostMedia', () => {
  it('returns an empty array when post has no media', () => {
    const post = create(PostSchema, { id: 'post-1', body: 'hello' });
    expect(extractPostMedia(post)).toEqual([]);
  });

  it('extracts valid media attachments and trims mediaId', () => {
    const post = create(PostSchema, {
      id: 'post-2',
      body: 'post with media',
      media: [
        create(MediaAttachmentSchema, {
          mediaId: ' m1 ',
          altText: 'Sample Image 1',
          mimeType: 'image/png',
        }),
        create(MediaAttachmentSchema, {
          mediaId: '',
          altText: 'Empty ID',
        }),
        create(MediaAttachmentSchema, {
          mediaId: 'm2',
          altText: 'Sample Image 2',
          mimeType: 'image/jpeg',
        }),
      ],
    });

    const media = extractPostMedia(post);
    expect(media).toHaveLength(2);
    expect(media[0]).toEqual({
      mediaId: 'm1',
      altText: 'Sample Image 1',
      mimeType: 'image/png',
    });
    expect(media[1]).toEqual({
      mediaId: 'm2',
      altText: 'Sample Image 2',
      mimeType: 'image/jpeg',
    });
  });
});

describe('safeMediaUrl', () => {
  it('accepts valid http and https URLs', () => {
    expect(safeMediaUrl('https://r2.example.com/image.png')).toBe(
      'https://r2.example.com/image.png',
    );
    expect(safeMediaUrl('http://localhost:9000/image.jpg')).toBe('http://localhost:9000/image.jpg');
  });

  it('rejects null, undefined, or empty URLs', () => {
    expect(safeMediaUrl(null)).toBeNull();
    expect(safeMediaUrl(undefined)).toBeNull();
    expect(safeMediaUrl('')).toBeNull();
  });

  it('rejects unsafe schemes like javascript: or file:', () => {
    expect(safeMediaUrl('javascript:alert(1)')).toBeNull();
    expect(safeMediaUrl('file:///etc/passwd')).toBeNull();
    expect(safeMediaUrl('data:image/png;base64,123')).toBeNull();
  });
});
