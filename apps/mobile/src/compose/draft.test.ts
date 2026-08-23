import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema, PostSchema, PostVisibility, QuotePolicy } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import {
  addDraftMedia,
  buildComposeSubmission,
  ComposeDraftStore,
  composeTargetKey,
  createComposeDraftState,
  isSameComposeTarget,
  removeDraftMedia,
  resetComposeDraftState,
  sanitizeDraftForTarget,
  setDraftBody,
  setDraftContentWarning,
  setDraftCwEnabled,
  syncComposeDraftState,
  type ComposeTarget,
} from './draft.js';
import { MAX_COMPOSE_MEDIA, type ComposeDraft } from './requests.js';

describe('composeTargetKey', () => {
  it('generates predictable keys for each compose target kind', () => {
    expect(composeTargetKey({ kind: 'post' })).toBe('post:root');
    expect(composeTargetKey({ kind: 'reply', replyTo: { id: 'post-1' } })).toBe('reply:post-1');
    expect(composeTargetKey({ kind: 'quote', quote: { id: 'post-2' } })).toBe('quote:post-2');
    expect(
      composeTargetKey({
        kind: 'edit',
        editing: { id: 'post-3', body: '', contentWarning: '', media: [] },
      }),
    ).toBe('edit:post-3');
  });
});

describe('isSameComposeTarget', () => {
  it('returns true for identical targets', () => {
    expect(isSameComposeTarget({ kind: 'post' }, { kind: 'post' })).toBe(true);
    expect(
      isSameComposeTarget(
        { kind: 'reply', replyTo: { id: 'p1' } },
        { kind: 'reply', replyTo: { id: 'p1' } },
      ),
    ).toBe(true);
    expect(
      isSameComposeTarget(
        { kind: 'quote', quote: { id: 'q1' } },
        { kind: 'quote', quote: { id: 'q1' } },
      ),
    ).toBe(true);
  });

  it('returns false when kinds or IDs differ', () => {
    expect(isSameComposeTarget({ kind: 'post' }, { kind: 'reply', replyTo: { id: 'p1' } })).toBe(
      false,
    );
    expect(
      isSameComposeTarget(
        { kind: 'reply', replyTo: { id: 'p1' } },
        { kind: 'reply', replyTo: { id: 'p2' } },
      ),
    ).toBe(false);
    expect(
      isSameComposeTarget(
        { kind: 'quote', quote: { id: 'p1' } },
        { kind: 'reply', replyTo: { id: 'p1' } },
      ),
    ).toBe(false);
  });
});

describe('createComposeDraftState and resetComposeDraftState', () => {
  it('creates an empty root post draft state with no reply/quote IDs', () => {
    const state = createComposeDraftState({ kind: 'post' });
    expect(state.targetKey).toBe('post:root');
    expect(state.target).toEqual({ kind: 'post' });
    expect(state.draft).toEqual({
      body: '',
      contentWarning: '',
      mediaIds: [],
      inReplyToId: '',
      quotedPostId: '',
    });
    expect(state.cwEnabled).toBe(false);
  });

  it('creates reply draft with inReplyToId and empty quotedPostId', () => {
    const state = createComposeDraftState({
      kind: 'reply',
      replyTo: { id: 'post-100' },
    });
    expect(state.targetKey).toBe('reply:post-100');
    expect(state.draft.inReplyToId).toBe('post-100');
    expect(state.draft.quotedPostId).toBe('');
    expect(state.draft.body).toBe('');
    expect(state.cwEnabled).toBe(false);
  });

  it('creates quote draft with quotedPostId and empty inReplyToId', () => {
    const state = createComposeDraftState({
      kind: 'quote',
      quote: { id: 'post-200' },
    });
    expect(state.targetKey).toBe('quote:post-200');
    expect(state.draft.quotedPostId).toBe('post-200');
    expect(state.draft.inReplyToId).toBe('');
    expect(state.draft.body).toBe('');
    expect(state.cwEnabled).toBe(false);
  });

  it('seeds edit draft from existing post without carrying reply/quote IDs', () => {
    const post = create(PostSchema, {
      id: 'post-300',
      body: 'Original text',
      contentWarning: 'Spoilers',
      media: [
        create(MediaAttachmentSchema, { mediaId: 'm1' }),
        create(MediaAttachmentSchema, { mediaId: 'm2' }),
      ],
    });
    const state = createComposeDraftState({ kind: 'edit', editing: post });
    expect(state.targetKey).toBe('edit:post-300');
    expect(state.draft.body).toBe('Original text');
    expect(state.draft.contentWarning).toBe('Spoilers');
    expect(state.draft.mediaIds).toEqual(['m1', 'm2']);
    expect(state.draft.inReplyToId).toBe('');
    expect(state.draft.quotedPostId).toBe('');
    expect(state.cwEnabled).toBe(true);
  });

  it('resets draft back to initial state for target', () => {
    const resetPost = resetComposeDraftState();
    expect(resetPost.targetKey).toBe('post:root');
    expect(resetPost.draft.body).toBe('');

    const resetReply = resetComposeDraftState({
      kind: 'reply',
      replyTo: { id: 'post-55' },
    });
    expect(resetReply.targetKey).toBe('reply:post-55');
    expect(resetReply.draft.inReplyToId).toBe('post-55');
  });
});

describe('syncComposeDraftState (cross-target isolation)', () => {
  it('preserves existing state when the target is unchanged', () => {
    const initial = createComposeDraftState({ kind: 'post' });
    const modified = setDraftBody(initial, 'draft in progress');
    const synced = syncComposeDraftState(modified, { kind: 'post' });

    expect(synced).toBe(modified);
    expect(synced.draft.body).toBe('draft in progress');
  });

  it('resets state and isolates content when target changes to prevent leaks', () => {
    const post = create(PostSchema, {
      id: 'post-edit-1',
      body: 'Secret edit content',
      contentWarning: 'CW',
      media: [create(MediaAttachmentSchema, { mediaId: 'm-edit' })],
    });
    const editState = createComposeDraftState({ kind: 'edit', editing: post });

    // Switch from edit to root post: edit content/media must NOT leak
    const rootState = syncComposeDraftState(editState, { kind: 'post' });
    expect(rootState.targetKey).toBe('post:root');
    expect(rootState.draft.body).toBe('');
    expect(rootState.draft.contentWarning).toBe('');
    expect(rootState.draft.mediaIds).toEqual([]);
    expect(rootState.draft.inReplyToId).toBe('');
    expect(rootState.draft.quotedPostId).toBe('');
    expect(rootState.cwEnabled).toBe(false);

    // Switch from reply to quote: reply target ID must NOT leak
    const replyState = createComposeDraftState({
      kind: 'reply',
      replyTo: { id: 'reply-target' },
    });
    const editedReply = setDraftBody(replyState, 'replying here');
    const quoteState = syncComposeDraftState(editedReply, {
      kind: 'quote',
      quote: { id: 'quote-target' },
    });

    expect(quoteState.targetKey).toBe('quote:quote-target');
    expect(quoteState.draft.inReplyToId).toBe('');
    expect(quoteState.draft.quotedPostId).toBe('quote-target');
    expect(quoteState.draft.body).toBe('');
  });
});

describe('sanitizeDraftForTarget', () => {
  const dirtyDraft: ComposeDraft = {
    body: 'Text',
    contentWarning: 'CW',
    mediaIds: ['m1', 'm2', 'm3', 'm4', 'm5'], // exceeds MAX_COMPOSE_MEDIA
    inReplyToId: 'stray-reply-id',
    quotedPostId: 'stray-quote-id',
  };

  it('strips reply/quote IDs for root post and caps media to MAX_COMPOSE_MEDIA', () => {
    const sanitized = sanitizeDraftForTarget(dirtyDraft, { kind: 'post' });
    expect(sanitized.inReplyToId).toBe('');
    expect(sanitized.quotedPostId).toBe('');
    expect(sanitized.mediaIds).toHaveLength(MAX_COMPOSE_MEDIA);
    expect(sanitized.mediaIds).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('sets only inReplyToId for reply targets', () => {
    const sanitized = sanitizeDraftForTarget(dirtyDraft, {
      kind: 'reply',
      replyTo: { id: 'expected-reply-id' },
    });
    expect(sanitized.inReplyToId).toBe('expected-reply-id');
    expect(sanitized.quotedPostId).toBe('');
  });

  it('sets only quotedPostId for quote targets', () => {
    const sanitized = sanitizeDraftForTarget(dirtyDraft, {
      kind: 'quote',
      quote: { id: 'expected-quote-id' },
    });
    expect(sanitized.inReplyToId).toBe('');
    expect(sanitized.quotedPostId).toBe('expected-quote-id');
  });

  it('strips both reply/quote IDs for edit targets', () => {
    const sanitized = sanitizeDraftForTarget(dirtyDraft, {
      kind: 'edit',
      editing: { id: 'post-1', body: '', contentWarning: '', media: [] },
    });
    expect(sanitized.inReplyToId).toBe('');
    expect(sanitized.quotedPostId).toBe('');
  });
});

describe('immutable draft state updaters', () => {
  it('updates body, content warning, and cwEnabled', () => {
    let state = createComposeDraftState({ kind: 'post' });

    state = setDraftBody(state, 'Hello world');
    expect(state.draft.body).toBe('Hello world');

    state = setDraftContentWarning(state, 'Spoilers');
    expect(state.draft.contentWarning).toBe('Spoilers');

    state = setDraftCwEnabled(state, true);
    expect(state.cwEnabled).toBe(true);

    state = setDraftCwEnabled(state, false);
    expect(state.cwEnabled).toBe(false);
  });

  it('adds and removes media attachments cleanly', () => {
    let state = createComposeDraftState({ kind: 'post' });

    state = addDraftMedia(state, 'm1');
    state = addDraftMedia(state, 'm2');
    expect(state.draft.mediaIds).toEqual(['m1', 'm2']);

    // Duplicate additions are ignored
    state = addDraftMedia(state, 'm1');
    expect(state.draft.mediaIds).toEqual(['m1', 'm2']);

    state = addDraftMedia(state, 'm3');
    state = addDraftMedia(state, 'm4');
    // Capped at MAX_COMPOSE_MEDIA (4)
    state = addDraftMedia(state, 'm5');
    expect(state.draft.mediaIds).toEqual(['m1', 'm2', 'm3', 'm4']);

    // Remove media
    state = removeDraftMedia(state, 'm2');
    expect(state.draft.mediaIds).toEqual(['m1', 'm3', 'm4']);

    // Removing non-existent media is no-op
    state = removeDraftMedia(state, 'm99');
    expect(state.draft.mediaIds).toEqual(['m1', 'm3', 'm4']);
  });
});

describe('buildComposeSubmission', () => {
  it('builds CreatePostInput for root post without content warning when cwEnabled is false', () => {
    let state = createComposeDraftState({ kind: 'post' });
    state = setDraftBody(state, 'Public post');
    state = setDraftContentWarning(state, 'Unused warning');
    state = setDraftCwEnabled(state, false);

    const submission = buildComposeSubmission(state, 'req-abc');
    expect(submission.kind).toBe('create');
    if (submission.kind === 'create') {
      expect(submission.input).toEqual({
        clientRequestId: 'req-abc',
        body: 'Public post',
        linkUrl: '',
        visibility: PostVisibility.PUBLIC,
        inReplyToId: '',
        mediaIds: [],
        contentWarning: '',
        quotedPostId: '',
        communityId: '',
        quotePolicy: QuotePolicy.ANYONE,
      });
    }
  });

  it('builds CreatePostInput with content warning when cwEnabled is true', () => {
    let state = createComposeDraftState({
      kind: 'reply',
      replyTo: { id: 'parent-post' },
    });
    state = setDraftBody(state, 'Replying with CW');
    state = setDraftContentWarning(state, 'Food');
    state = setDraftCwEnabled(state, true);
    state = addDraftMedia(state, 'media-1');

    const submission = buildComposeSubmission(state, 'req-123');
    expect(submission.kind).toBe('create');
    if (submission.kind === 'create') {
      expect(submission.input.inReplyToId).toBe('parent-post');
      expect(submission.input.quotedPostId).toBe('');
      expect(submission.input.contentWarning).toBe('Food');
      expect(submission.input.mediaIds).toEqual(['media-1']);
    }
  });

  it('builds EditPostInput for edit target', () => {
    const post = create(PostSchema, {
      id: 'edit-post-id',
      body: 'Original',
      contentWarning: '',
      media: [],
    });
    let state = createComposeDraftState({ kind: 'edit', editing: post });
    state = setDraftBody(state, 'Updated content');
    state = setDraftContentWarning(state, 'New CW');
    state = setDraftCwEnabled(state, true);
    state = addDraftMedia(state, 'm-new');

    const submission = buildComposeSubmission(state, 'req-ignored');
    expect(submission).toEqual({
      kind: 'edit',
      postId: 'edit-post-id',
      input: {
        id: 'edit-post-id',
        body: 'Updated content',
        contentWarning: 'New CW',
        mediaIds: ['m-new'],
      },
    });
  });
});

describe('ComposeDraftStore', () => {
  it('manages separate drafts across different targets without crosstalk', () => {
    const store = new ComposeDraftStore();
    const rootTarget: ComposeTarget = { kind: 'post' };
    const replyTarget: ComposeTarget = { kind: 'reply', replyTo: { id: 'p1' } };

    let rootState = store.getDraft(rootTarget);
    rootState = setDraftBody(rootState, 'Root text');
    rootState = addDraftMedia(rootState, 'media-root');
    store.setDraft(rootState);

    let replyState = store.getDraft(replyTarget);
    replyState = setDraftBody(replyState, 'Reply text');
    replyState = addDraftMedia(replyState, 'media-reply');
    store.setDraft(replyState);

    // Retrieve both and verify strict isolation
    const retrievedRoot = store.getDraft(rootTarget);
    expect(retrievedRoot.draft.body).toBe('Root text');
    expect(retrievedRoot.draft.mediaIds).toEqual(['media-root']);
    expect(retrievedRoot.draft.inReplyToId).toBe('');

    const retrievedReply = store.getDraft(replyTarget);
    expect(retrievedReply.draft.body).toBe('Reply text');
    expect(retrievedReply.draft.mediaIds).toEqual(['media-reply']);
    expect(retrievedReply.draft.inReplyToId).toBe('p1');

    // Resetting root does not affect reply
    store.resetDraft(rootTarget);
    expect(store.getDraft(rootTarget).draft.body).toBe('');
    expect(store.getDraft(replyTarget).draft.body).toBe('Reply text');

    // Clear empties everything
    store.clear();
    expect(store.getDraft(replyTarget).draft.body).toBe('');
  });
});
