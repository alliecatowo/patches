import { create } from '@bufbuild/protobuf';
import type { MediaAttachment, Post } from '@patches/proto/es';
import { MediaAttachmentSchema, PostSchema } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import { getPostMediaItems, validateMediaDownloadUrl } from './postMedia.js';

describe('postMedia', () => {
  describe('getPostMediaItems', () => {
    it('returns empty array when post has no media', () => {
      const post = create(PostSchema, { id: 'post-1', body: 'Hello world' });
      expect(getPostMediaItems(post)).toEqual([]);
    });

    it('returns media items when post has media attachments', () => {
      const media1: MediaAttachment = create(MediaAttachmentSchema, {
        mediaId: 'media-1',
        altText: 'Cat photo',
      });
      const media2: MediaAttachment = create(MediaAttachmentSchema, {
        mediaId: 'media-2',
        altText: 'Dog photo',
      });
      const post: Post = create(PostSchema, {
        id: 'post-2',
        body: 'Look at my pets',
        media: [media1, media2],
      });

      const items = getPostMediaItems(post);
      expect(items).toHaveLength(2);
      expect(items[0]?.mediaId).toBe('media-1');
      expect(items[0]?.altText).toBe('Cat photo');
      expect(items[1]?.mediaId).toBe('media-2');
      expect(items[1]?.altText).toBe('Dog photo');
    });

    it('returns empty array if post is marked deleted', () => {
      const media: MediaAttachment = create(MediaAttachmentSchema, { mediaId: 'media-1' });
      const post: Post = create(PostSchema, {
        id: 'post-3',
        deleted: true,
        media: [media],
      });

      expect(getPostMediaItems(post)).toEqual([]);
    });
  });

  describe('validateMediaDownloadUrl', () => {
    it('allows valid http and https URLs', () => {
      expect(validateMediaDownloadUrl('https://r2.example.com/media/1.png')).toBe(
        'https://r2.example.com/media/1.png',
      );
      expect(validateMediaDownloadUrl('http://localhost:9000/media/1.png')).toBe(
        'http://localhost:9000/media/1.png',
      );
    });

    it('rejects non-http(s) scheme URLs', () => {
      expect(validateMediaDownloadUrl('javascript:alert(1)')).toBeNull();
      expect(validateMediaDownloadUrl('file:///etc/passwd')).toBeNull();
      expect(validateMediaDownloadUrl('data:text/html,bad')).toBeNull();
    });

    it('rejects malformed URLs', () => {
      expect(validateMediaDownloadUrl('not-a-url')).toBeNull();
      expect(validateMediaDownloadUrl('')).toBeNull();
    });
  });
});
