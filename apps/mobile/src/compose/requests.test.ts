import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema, PostSchema, PostVisibility, QuotePolicy } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import {
  buildCreatePostRequest,
  buildEditPostRequest,
  canSubmitCompose,
  draftFromPost,
  emptyComposeDraft,
} from './requests.js';

describe('canSubmitCompose', () => {
  it('rejects an empty draft with no media', () => {
    expect(canSubmitCompose(emptyComposeDraft(), 500, false)).toBe(false);
  });

  it('accepts a non-empty body under the limit', () => {
    expect(canSubmitCompose({ ...emptyComposeDraft(), body: 'hello' }, 500, false)).toBe(true);
  });

  it('accepts an empty body with at least one attached image', () => {
    const draft = { ...emptyComposeDraft(), mediaIds: ['m1'] };
    expect(canSubmitCompose(draft, 500, false)).toBe(true);
  });

  it('rejects a body over the character limit', () => {
    const draft = { ...emptyComposeDraft(), body: 'x'.repeat(10) };
    expect(canSubmitCompose(draft, 5, false)).toBe(false);
  });

  it('rejects whitespace-only body with no media', () => {
    const draft = { ...emptyComposeDraft(), body: '   ' };
    expect(canSubmitCompose(draft, 500, false)).toBe(false);
  });

  it('rejects while a media upload is in flight, even with a valid body', () => {
    expect(canSubmitCompose({ ...emptyComposeDraft(), body: 'hello' }, 500, true)).toBe(false);
  });
});

describe('buildCreatePostRequest', () => {
  it('carries reply/quote/media/content-warning through to the request', () => {
    const draft = {
      body: 'hello',
      contentWarning: 'spoilers',
      mediaIds: ['m1', 'm2'],
      inReplyToId: 'post-1',
      quotedPostId: 'post-2',
    };
    expect(buildCreatePostRequest(draft, 'req-1')).toEqual({
      clientRequestId: 'req-1',
      body: 'hello',
      linkUrl: '',
      visibility: PostVisibility.PUBLIC,
      inReplyToId: 'post-1',
      mediaIds: ['m1', 'm2'],
      contentWarning: 'spoilers',
      quotedPostId: 'post-2',
      communityId: '',
      quotePolicy: QuotePolicy.ANYONE,
    });
  });

  it('leaves inReplyToId/quotedPostId empty for a plain root post', () => {
    const request = buildCreatePostRequest(emptyComposeDraft(), 'req-1');
    expect(request.inReplyToId).toBe('');
    expect(request.quotedPostId).toBe('');
  });
});

describe('buildEditPostRequest', () => {
  it('carries body/content-warning/media but never reply/quote fields', () => {
    const draft = {
      body: 'revised',
      contentWarning: 'cw',
      mediaIds: ['m1'],
      inReplyToId: 'ignored',
      quotedPostId: 'ignored',
    };
    expect(buildEditPostRequest('post-1', draft)).toEqual({
      id: 'post-1',
      body: 'revised',
      contentWarning: 'cw',
      mediaIds: ['m1'],
    });
  });
});

describe('draftFromPost', () => {
  it('seeds body/contentWarning/mediaIds and clears reply/quote fields', () => {
    const post = create(PostSchema, {
      body: 'original',
      contentWarning: 'cw',
      media: [
        create(MediaAttachmentSchema, { mediaId: 'm1' }),
        create(MediaAttachmentSchema, { mediaId: 'm2' }),
      ],
    });
    expect(draftFromPost(post)).toEqual({
      body: 'original',
      contentWarning: 'cw',
      mediaIds: ['m1', 'm2'],
      inReplyToId: '',
      quotedPostId: '',
    });
  });
});
