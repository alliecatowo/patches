import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema, PostSchema } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

describe('PostRow media attachments data model', () => {
  it('creates post objects with media attachments correctly', () => {
    const postWithMedia = create(PostSchema, {
      id: 'post-1',
      body: 'Hello world with media',
      media: [
        create(MediaAttachmentSchema, {
          mediaId: 'media-1',
          altText: 'Sample image',
        }),
      ],
    });

    expect(postWithMedia.media).toHaveLength(1);
    expect(postWithMedia.media[0].mediaId).toBe('media-1');
    expect(postWithMedia.media[0].altText).toBe('Sample image');
  });

  it('handles posts without media attachments', () => {
    const postWithoutMedia = create(PostSchema, {
      id: 'post-2',
      body: 'Hello world without media',
      media: [],
    });

    expect(postWithoutMedia.media).toHaveLength(0);
  });
});
