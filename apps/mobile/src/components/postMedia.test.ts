import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import { toPostMediaViews } from './postMedia.js';

describe('toPostMediaViews', () => {
  it('returns empty array when attachments are undefined or empty', () => {
    expect(toPostMediaViews(undefined)).toEqual([]);
    expect(toPostMediaViews([])).toEqual([]);
  });

  it('filters out attachments without mediaId', () => {
    const invalid = create(MediaAttachmentSchema, { mediaId: '', altText: 'some alt' });
    expect(toPostMediaViews([invalid])).toEqual([]);
  });

  it('maps valid attachments and sanitizes altText', () => {
    const att1 = create(MediaAttachmentSchema, {
      mediaId: 'media-1',
      altText: 'Photo of a cat\nwith multi-line text',
    });
    const att2 = create(MediaAttachmentSchema, {
      mediaId: 'media-2',
      altText: '',
    });

    const views = toPostMediaViews([att1, att2]);
    expect(views).toEqual([
      {
        mediaId: 'media-1',
        altText: 'Photo of a cat with multi-line text',
      },
      {
        mediaId: 'media-2',
        altText: '',
      },
    ]);
  });
});
