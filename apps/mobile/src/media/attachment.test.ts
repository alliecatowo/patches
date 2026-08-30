import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema, PostSchema } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

describe('PostRow media attachment model (B-084)', () => {
  it('attaches and preserves media attachments on Post messages', () => {
    const attachment1 = create(MediaAttachmentSchema, {
      mediaId: 'm-123',
      altText: 'Sunset photo',
    });

    const attachment2 = create(MediaAttachmentSchema, {
      mediaId: 'm-456',
      altText: 'Cat photo',
    });

    const post = create(PostSchema, {
      id: 'post-with-media',
      body: 'Check out these photos!',
      media: [attachment1, attachment2],
    });

    expect(post.media).toHaveLength(2);
    expect(post.media[0].mediaId).toBe('m-123');
    expect(post.media[0].altText).toBe('Sunset photo');
    expect(post.media[1].mediaId).toBe('m-456');
    expect(post.media[1].altText).toBe('Cat photo');
  });

  it('handles posts with empty media list', () => {
    const post = create(PostSchema, {
      id: 'post-plain',
      body: 'No media here',
      media: [],
    });

    expect(post.media).toHaveLength(0);
  });
});
