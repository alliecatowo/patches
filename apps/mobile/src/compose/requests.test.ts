import { create } from '@bufbuild/protobuf';
import { MAX_POST_CHARS } from '@patches/domain';
import {
  GetNodeInfoResponseSchema,
  MediaAttachmentSchema,
  NodeLimitsSchema,
  PostSchema,
  PostVisibility,
  QuotePolicy,
  SocialCapabilitiesSchema,
} from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import {
  buildCreatePostRequest,
  buildEditPostRequest,
  canSubmitCompose,
  draftFromPost,
  emptyComposeDraft,
  resolveMaxPostChars,
} from './requests.js';

describe('resolveMaxPostChars', () => {
  it('returns MAX_POST_CHARS (5,000) when given undefined or null', () => {
    expect(resolveMaxPostChars(undefined)).toBe(MAX_POST_CHARS);
    expect(resolveMaxPostChars(null)).toBe(MAX_POST_CHARS);
    expect(resolveMaxPostChars()).toBe(5_000);
  });

  it('returns explicit positive numbers', () => {
    expect(resolveMaxPostChars(500)).toBe(500);
    expect(resolveMaxPostChars(7_500)).toBe(7_500);
    expect(resolveMaxPostChars(10_000)).toBe(10_000);
  });

  it('falls back to MAX_POST_CHARS on zero, negative, or invalid numbers', () => {
    expect(resolveMaxPostChars(0)).toBe(MAX_POST_CHARS);
    expect(resolveMaxPostChars(-100)).toBe(MAX_POST_CHARS);
    expect(resolveMaxPostChars(Number.NaN)).toBe(MAX_POST_CHARS);
    expect(resolveMaxPostChars(Number.POSITIVE_INFINITY)).toBe(MAX_POST_CHARS);
  });

  it('extracts maxPostChars from SocialCapabilities message', () => {
    const social = create(SocialCapabilitiesSchema, { maxPostChars: 8_000 });
    expect(resolveMaxPostChars({ socialCapabilities: social })).toBe(8_000);
  });

  it('extracts postBodyMaxChars from NodeLimits message', () => {
    const limits = create(NodeLimitsSchema, { postBodyMaxChars: 6_500 });
    expect(resolveMaxPostChars({ limits })).toBe(6_500);
  });

  it('extracts from full GetNodeInfoResponse', () => {
    const response = create(GetNodeInfoResponseSchema, {
      socialCapabilities: create(SocialCapabilitiesSchema, { maxPostChars: 9_000 }),
      limits: create(NodeLimitsSchema, { postBodyMaxChars: 9_000 }),
    });
    expect(resolveMaxPostChars(response)).toBe(9_000);
  });

  it('extracts from plain partial objects with direct properties', () => {
    expect(resolveMaxPostChars({ maxPostChars: 7_200 })).toBe(7_200);
    expect(resolveMaxPostChars({ postBodyMaxChars: 6_800 })).toBe(6_800);
  });

  it('falls back to MAX_POST_CHARS if object fields are zero or missing', () => {
    expect(resolveMaxPostChars({})).toBe(MAX_POST_CHARS);
    expect(
      resolveMaxPostChars({
        socialCapabilities: { maxPostChars: 0 },
        limits: { postBodyMaxChars: 0 },
      }),
    ).toBe(MAX_POST_CHARS);
  });
});

describe('canSubmitCompose', () => {
  it('rejects an empty draft with no media', () => {
    expect(canSubmitCompose(emptyComposeDraft(), 500, false)).toBe(false);
    expect(canSubmitCompose(emptyComposeDraft())).toBe(false);
  });

  it('accepts a non-empty body under the limit', () => {
    expect(canSubmitCompose({ ...emptyComposeDraft(), body: 'hello' }, 500, false)).toBe(true);
    expect(canSubmitCompose({ ...emptyComposeDraft(), body: 'hello' })).toBe(true);
  });

  it('accepts an empty body with at least one attached image', () => {
    const draft = { ...emptyComposeDraft(), mediaIds: ['m1'] };
    expect(canSubmitCompose(draft, 500, false)).toBe(true);
  });

  it('rejects a body over the numeric character limit', () => {
    const draft = { ...emptyComposeDraft(), body: 'x'.repeat(10) };
    expect(canSubmitCompose(draft, 5, false)).toBe(false);
  });

  it('accepts a body exactly at the character limit', () => {
    const draft = { ...emptyComposeDraft(), body: 'x'.repeat(5) };
    expect(canSubmitCompose(draft, 5, false)).toBe(true);
  });

  it('correctly uses node info object for character limit', () => {
    const nodeInfo = create(GetNodeInfoResponseSchema, {
      socialCapabilities: create(SocialCapabilitiesSchema, { maxPostChars: 10 }),
    });
    const validDraft = { ...emptyComposeDraft(), body: 'x'.repeat(10) };
    const invalidDraft = { ...emptyComposeDraft(), body: 'x'.repeat(11) };

    expect(canSubmitCompose(validDraft, nodeInfo, false)).toBe(true);
    expect(canSubmitCompose(invalidDraft, nodeInfo, false)).toBe(false);
  });

  it('rejects whitespace-only body with no media', () => {
    const draft = { ...emptyComposeDraft(), body: '   ' };
    expect(canSubmitCompose(draft, 500, false)).toBe(false);
  });

  it('rejects while a media upload is in flight, even with a valid body', () => {
    expect(canSubmitCompose({ ...emptyComposeDraft(), body: 'hello' }, 500, true)).toBe(false);
  });

  it('counts multi-byte characters / emojis by code points', () => {
    const emojiBody = '🎉'.repeat(5); // 5 emoji chars, 10 UTF-16 code units
    const draft = { ...emptyComposeDraft(), body: emojiBody };
    expect(canSubmitCompose(draft, 5, false)).toBe(true);
    expect(canSubmitCompose(draft, 4, false)).toBe(false);
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
