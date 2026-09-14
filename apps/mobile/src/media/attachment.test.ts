import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import { sortMediaAttachments } from './attachment.js';

describe('sortMediaAttachments', () => {
  it('returns empty array when input is undefined or empty', () => {
    expect(sortMediaAttachments(undefined)).toEqual([]);
    expect(sortMediaAttachments([])).toEqual([]);
  });

  it('sorts media attachments by position', () => {
    const m1 = create(MediaAttachmentSchema, { mediaId: 'm1', position: 2 });
    const m2 = create(MediaAttachmentSchema, { mediaId: 'm2', position: 0 });
    const m3 = create(MediaAttachmentSchema, { mediaId: 'm3', position: 1 });

    const sorted = sortMediaAttachments([m1, m2, m3]);
    expect(sorted.map((m) => m.mediaId)).toEqual(['m2', 'm3', 'm1']);
  });

  it('preserves order when position is equal or default', () => {
    const m1 = create(MediaAttachmentSchema, { mediaId: 'm1', position: 0 });
    const m2 = create(MediaAttachmentSchema, { mediaId: 'm2', position: 0 });

    const sorted = sortMediaAttachments([m1, m2]);
    expect(sorted.map((m) => m.mediaId)).toEqual(['m1', 'm2']);
  });
});
