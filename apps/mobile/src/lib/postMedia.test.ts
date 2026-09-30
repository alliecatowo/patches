import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';
import { getDisplayMediaAttachments, validateMediaDownloadUrl } from './postMedia.js';

describe('postMedia', () => {
  describe('validateMediaDownloadUrl', () => {
    it('accepts valid http and https URLs', () => {
      expect(validateMediaDownloadUrl('http://example.com/image.png')).toBe(
        'http://example.com/image.png',
      );
      expect(validateMediaDownloadUrl('https://r2.patches.social/media/123.jpg')).toBe(
        'https://r2.patches.social/media/123.jpg',
      );
    });

    it('rejects null, undefined, empty, or invalid URLs', () => {
      expect(validateMediaDownloadUrl(null)).toBeNull();
      expect(validateMediaDownloadUrl(undefined)).toBeNull();
      expect(validateMediaDownloadUrl('')).toBeNull();
      expect(validateMediaDownloadUrl('   ')).toBeNull();
      expect(validateMediaDownloadUrl('not-a-url')).toBeNull();
    });

    it('rejects unsafe schemes like javascript: or data:', () => {
      expect(validateMediaDownloadUrl('javascript:alert(1)')).toBeNull();
      expect(validateMediaDownloadUrl('data:image/png;base64,abc')).toBeNull();
      expect(validateMediaDownloadUrl('file:///etc/passwd')).toBeNull();
    });

    it('rejects URLs containing control characters or unsafe bytes', () => {
      const nullByte = String.fromCharCode(0);
      const ctrlByte = String.fromCharCode(1);
      expect(validateMediaDownloadUrl(`https://example.com/image${nullByte}.png`)).toBeNull();
      expect(validateMediaDownloadUrl(`https://example.com/image${ctrlByte}.png`)).toBeNull();
    });
  });

  describe('getDisplayMediaAttachments', () => {
    it('returns empty array for null or undefined input', () => {
      expect(getDisplayMediaAttachments(null)).toEqual([]);
      expect(getDisplayMediaAttachments(undefined)).toEqual([]);
    });

    it('filters out invalid or empty media items', () => {
      const valid1 = create(MediaAttachmentSchema, { mediaId: 'm1', altText: 'Alt 1' });
      const valid2 = create(MediaAttachmentSchema, { mediaId: 'm2', altText: '' });
      const invalid = create(MediaAttachmentSchema, { mediaId: '' });

      const result = getDisplayMediaAttachments([valid1, invalid, valid2]);
      expect(result).toHaveLength(2);
      expect(result[0]?.mediaId).toBe('m1');
      expect(result[1]?.mediaId).toBe('m2');
    });
  });
});
