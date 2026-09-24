import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import {
  getSortedMediaAttachments,
  shouldRenderMedia,
  validateMediaDownloadUrl,
} from './attachment.js';

describe('getSortedMediaAttachments', () => {
  it('returns empty array when media is undefined or empty', () => {
    expect(getSortedMediaAttachments(undefined)).toEqual([]);
    expect(getSortedMediaAttachments([])).toEqual([]);
  });

  it('sorts media attachments by position in ascending order', () => {
    const item1 = create(MediaAttachmentSchema, {
      mediaId: 'm1',
      altText: 'First',
      position: 1,
    });
    const item2 = create(MediaAttachmentSchema, {
      mediaId: 'm2',
      altText: 'Second',
      position: 0,
    });
    const item3 = create(MediaAttachmentSchema, {
      mediaId: 'm3',
      altText: 'Third',
      position: 2,
    });

    const sorted = getSortedMediaAttachments([item1, item2, item3]);
    expect(sorted.map((m) => m.mediaId)).toEqual(['m2', 'm1', 'm3']);
  });
});

describe('validateMediaDownloadUrl', () => {
  it('returns null for empty, null, or undefined input', () => {
    expect(validateMediaDownloadUrl(null)).toBeNull();
    expect(validateMediaDownloadUrl(undefined)).toBeNull();
    expect(validateMediaDownloadUrl('')).toBeNull();
    expect(validateMediaDownloadUrl('   ')).toBeNull();
  });

  it('accepts valid http and https URLs', () => {
    expect(validateMediaDownloadUrl('https://r2.example.com/image.png')).toBe(
      'https://r2.example.com/image.png',
    );
    expect(validateMediaDownloadUrl('http://localhost:9000/media/test.jpg')).toBe(
      'http://localhost:9000/media/test.jpg',
    );
  });

  it('rejects non-http/https schemes and unsafe URLs', () => {
    expect(validateMediaDownloadUrl('javascript:alert(1)')).toBeNull();
    expect(validateMediaDownloadUrl('file:///etc/passwd')).toBeNull();
    expect(validateMediaDownloadUrl('data:image/png;base64,xxxx')).toBeNull();
    expect(validateMediaDownloadUrl('https://example.com/img.png\x00')).toBeNull();
  });
});

describe('shouldRenderMedia', () => {
  const media = [create(MediaAttachmentSchema, { mediaId: 'm1' })];

  it('returns false if post is deleted', () => {
    expect(shouldRenderMedia({ deleted: true, media }, true)).toBe(false);
  });

  it('returns false if content warning is not opened', () => {
    expect(shouldRenderMedia({ deleted: false, media }, false)).toBe(false);
  });

  it('returns false if media is missing or empty', () => {
    expect(shouldRenderMedia({ deleted: false, media: [] }, true)).toBe(false);
    expect(shouldRenderMedia({ deleted: false, media: undefined }, true)).toBe(false);
  });

  it('returns true for active post with media when cwOpen is true', () => {
    expect(shouldRenderMedia({ deleted: false, media }, true)).toBe(true);
  });
});
