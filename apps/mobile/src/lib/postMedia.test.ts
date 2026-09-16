import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import { getValidMediaAttachments, sanitizeAltText } from './postMedia.js';

describe('getValidMediaAttachments', () => {
  it('returns empty array when media is undefined or null or empty', () => {
    expect(getValidMediaAttachments(undefined)).toEqual([]);
    expect(getValidMediaAttachments(null)).toEqual([]);
    expect(getValidMediaAttachments([])).toEqual([]);
  });

  it('filters out attachments without a mediaId or with an empty mediaId', () => {
    const valid = create(MediaAttachmentSchema, { mediaId: 'media-123', altText: 'Photo' });
    const emptyId = create(MediaAttachmentSchema, { mediaId: '  ', altText: 'No id' });
    const noId = create(MediaAttachmentSchema, { altText: 'Missing' });

    const result = getValidMediaAttachments([valid, emptyId, noId]);
    expect(result).toHaveLength(1);
    expect(result[0]?.mediaId).toBe('media-123');
  });
});

describe('sanitizeAltText', () => {
  it('returns null for undefined, null, or empty/whitespace strings', () => {
    expect(sanitizeAltText(undefined)).toBeNull();
    expect(sanitizeAltText(null)).toBeNull();
    expect(sanitizeAltText('')).toBeNull();
    expect(sanitizeAltText('   ')).toBeNull();
  });

  it('returns trimmed string for non-empty alt text', () => {
    expect(sanitizeAltText('  A cute cat  ')).toBe('A cute cat');
  });
});
