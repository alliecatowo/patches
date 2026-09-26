import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import { formatMediaAltText, getSafeMediaUrl, sortMediaAttachments } from './postMedia.js';

describe('postMedia helpers (B-084)', () => {
  describe('sortMediaAttachments', () => {
    it('returns an empty array for undefined or empty media', () => {
      expect(sortMediaAttachments(undefined)).toEqual([]);
      expect(sortMediaAttachments([])).toEqual([]);
    });

    it('sorts media attachments by position ascending', () => {
      const m1 = create(MediaAttachmentSchema, { mediaId: 'm1', position: 2 });
      const m2 = create(MediaAttachmentSchema, { mediaId: 'm2', position: 0 });
      const m3 = create(MediaAttachmentSchema, { mediaId: 'm3', position: 1 });

      const sorted = sortMediaAttachments([m1, m2, m3]);
      expect(sorted.map((m) => m.mediaId)).toEqual(['m2', 'm3', 'm1']);
    });
  });

  describe('getSafeMediaUrl', () => {
    it('returns the URL when valid http or https', () => {
      expect(getSafeMediaUrl('https://r2.example.com/media1.png')).toBe(
        'https://r2.example.com/media1.png',
      );
      expect(getSafeMediaUrl('http://localhost:9000/test.jpg')).toBe(
        'http://localhost:9000/test.jpg',
      );
    });

    it('returns null for unsafe or invalid schemes', () => {
      expect(getSafeMediaUrl('javascript:alert(1)')).toBeNull();
      expect(getSafeMediaUrl('file:///etc/passwd')).toBeNull();
      expect(getSafeMediaUrl('not-a-url')).toBeNull();
      expect(getSafeMediaUrl('https://example.com/\x00evil')).toBeNull();
    });
  });

  describe('formatMediaAltText', () => {
    it('returns trimmed alt text or empty string when undefined/blank', () => {
      expect(formatMediaAltText(undefined)).toBe('');
      expect(formatMediaAltText('  ')).toBe('');
      expect(formatMediaAltText('  a sunset over mountains  ')).toBe('a sunset over mountains');
    });
  });
});
