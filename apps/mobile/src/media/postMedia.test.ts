import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema, type MediaAttachment } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import { toPostMediaItems } from './postMedia.js';

describe('toPostMediaItems', () => {
  it('returns an empty array when mediaAttachments is undefined or empty', () => {
    expect(toPostMediaItems(undefined)).toEqual([]);
    expect(toPostMediaItems([])).toEqual([]);
  });

  it('filters out items with missing, empty, or whitespace-only mediaId', () => {
    const items: MediaAttachment[] = [
      create(MediaAttachmentSchema, { mediaId: '', altText: 'empty id' }),
      create(MediaAttachmentSchema, { mediaId: '   ', altText: 'whitespace id' }),
      create(MediaAttachmentSchema, {
        mediaId: 'media-1',
        altText: 'valid image',
        width: 800,
        height: 600,
        mimeType: 'image/png',
      }),
    ];

    const result = toPostMediaItems(items);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      mediaId: 'media-1',
      altText: 'valid image',
      width: 800,
      height: 600,
      mimeType: 'image/png',
    });
  });

  it('sanitizes altText by stripping multiline characters and control sequences', () => {
    const items: MediaAttachment[] = [
      create(MediaAttachmentSchema, {
        mediaId: 'media-1',
        altText: 'A cat\nwith\r\nmultiline\t\x00alt text',
      }),
    ];

    const result = toPostMediaItems(items);
    expect(result[0]?.altText).toBe('A cat with multiline alt text');
  });

  it('caps the list at 4 items maximum (spec §28)', () => {
    const items: MediaAttachment[] = Array.from({ length: 6 }, (_, i) =>
      create(MediaAttachmentSchema, {
        mediaId: `media-${i + 1}`,
        altText: `Image ${i + 1}`,
      }),
    );

    const result = toPostMediaItems(items);
    expect(result).toHaveLength(4);
    expect(result.map((item) => item.mediaId)).toEqual([
      'media-1',
      'media-2',
      'media-3',
      'media-4',
    ]);
  });
});
