import type { Post } from '@patches/proto/es';

import {
  buildCreatePostRequest,
  buildEditPostRequest,
  draftFromPost,
  emptyComposeDraft,
  MAX_COMPOSE_MEDIA,
  type ComposeDraft,
  type CreatePostInput,
  type EditPostInput,
} from './requests.js';

/**
 * Compose targets supported by the mobile client:
 * - root post: a new top-level post
 * - reply: a reply to `replyTo`
 * - quote: a quote of `quote`
 * - edit: in-place edit of the author's own post `editing`
 */
export type ComposeTarget =
  | { kind: 'post' }
  | { kind: 'reply'; replyTo: { id: string } | Pick<Post, 'id'> | Post }
  | {
      kind: 'quote';
      quote: { id: string; author?: Post['author'] | undefined; body?: string | undefined } | Post;
    }
  | {
      kind: 'edit';
      editing:
        | {
            id: string;
            body?: string | undefined;
            contentWarning?: string | undefined;
            media?: Post['media'] | undefined;
          }
        | Post;
    };

export type ComposeTargetKind = ComposeTarget['kind'];

/**
 * Returns a stable key uniquely identifying the compose target.
 * Keying draft state by this key prevents drafts from accidentally leaking across targets.
 */
export function composeTargetKey(target: ComposeTarget): string {
  switch (target.kind) {
    case 'post':
      return 'post:root';
    case 'reply':
      return `reply:${target.replyTo.id}`;
    case 'quote':
      return `quote:${target.quote.id}`;
    case 'edit':
      return `edit:${target.editing.id}`;
  }
}

/**
 * Returns true if two targets point to the same target type and entity.
 */
export function isSameComposeTarget(a: ComposeTarget, b: ComposeTarget): boolean {
  return composeTargetKey(a) === composeTargetKey(b);
}

/**
 * Guaranteed draft state keyed by target to avoid cross-target submission bugs.
 */
export interface ComposeDraftState {
  readonly targetKey: string;
  readonly target: ComposeTarget;
  readonly draft: ComposeDraft;
  readonly cwEnabled: boolean;
}

/**
 * Creates a fresh, target-isolated draft state.
 * For `edit` targets, seeds from the post's existing body, content warning, and media attachments.
 * For `reply` / `quote` targets, sets the respective ID and clears the other.
 * For `post` targets, ensures both reply and quote IDs are empty.
 */
export function createComposeDraftState(
  target: ComposeTarget,
  initialDraft?: Partial<ComposeDraft>,
): ComposeDraftState {
  const targetKey = composeTargetKey(target);
  let draft: ComposeDraft;

  if (target.kind === 'edit') {
    const base = draftFromPost(target.editing);
    draft = {
      body: initialDraft?.body ?? base.body,
      contentWarning: initialDraft?.contentWarning ?? base.contentWarning,
      mediaIds: initialDraft?.mediaIds ? [...initialDraft.mediaIds] : base.mediaIds,
      inReplyToId: '',
      quotedPostId: '',
    };
  } else {
    const base = emptyComposeDraft();
    draft = {
      body: initialDraft?.body ?? base.body,
      contentWarning: initialDraft?.contentWarning ?? base.contentWarning,
      mediaIds: initialDraft?.mediaIds ? [...initialDraft.mediaIds] : base.mediaIds,
      inReplyToId: target.kind === 'reply' ? target.replyTo.id : '',
      quotedPostId: target.kind === 'quote' ? target.quote.id : '',
    };
  }

  const cwEnabled = draft.contentWarning.trim() !== '';

  return {
    targetKey,
    target,
    draft,
    cwEnabled,
  };
}

/**
 * Resets draft state for a target back to its initial state.
 */
export function resetComposeDraftState(
  target: ComposeTarget = { kind: 'post' },
): ComposeDraftState {
  return createComposeDraftState(target);
}

/**
 * Returns the current draft state if the target is unchanged, or resets to a fresh
 * draft state for `nextTarget` if the target changed, preventing draft content or media
 * from leaking from one target into another.
 */
export function syncComposeDraftState(
  currentState: ComposeDraftState,
  nextTarget: ComposeTarget,
): ComposeDraftState {
  if (currentState.targetKey === composeTargetKey(nextTarget)) {
    return currentState;
  }
  return createComposeDraftState(nextTarget);
}

/**
 * Sanitizes a draft so its `inReplyToId`, `quotedPostId`, and media count strictly match
 * the target requirements, preventing reply/quote IDs from leaking into root posts or edits.
 */
export function sanitizeDraftForTarget(draft: ComposeDraft, target: ComposeTarget): ComposeDraft {
  const mediaIds = draft.mediaIds.slice(0, MAX_COMPOSE_MEDIA);
  switch (target.kind) {
    case 'post':
      return {
        body: draft.body,
        contentWarning: draft.contentWarning,
        mediaIds,
        inReplyToId: '',
        quotedPostId: '',
      };
    case 'reply':
      return {
        body: draft.body,
        contentWarning: draft.contentWarning,
        mediaIds,
        inReplyToId: target.replyTo.id,
        quotedPostId: '',
      };
    case 'quote':
      return {
        body: draft.body,
        contentWarning: draft.contentWarning,
        mediaIds,
        inReplyToId: '',
        quotedPostId: target.quote.id,
      };
    case 'edit':
      return {
        body: draft.body,
        contentWarning: draft.contentWarning,
        mediaIds,
        inReplyToId: '',
        quotedPostId: '',
      };
  }
}

/**
 * Immutably updates the body of the compose draft.
 */
export function setDraftBody(state: ComposeDraftState, body: string): ComposeDraftState {
  return {
    ...state,
    draft: {
      ...state.draft,
      body,
    },
  };
}

/**
 * Immutably updates the content warning text of the compose draft.
 */
export function setDraftContentWarning(
  state: ComposeDraftState,
  contentWarning: string,
): ComposeDraftState {
  return {
    ...state,
    draft: {
      ...state.draft,
      contentWarning,
    },
  };
}

/**
 * Immutably toggles or sets content warning enablement.
 */
export function setDraftCwEnabled(state: ComposeDraftState, cwEnabled: boolean): ComposeDraftState {
  return {
    ...state,
    cwEnabled,
  };
}

/**
 * Immutably appends a media ID to the draft's attachments up to `MAX_COMPOSE_MEDIA`.
 */
export function addDraftMedia(state: ComposeDraftState, mediaId: string): ComposeDraftState {
  if (state.draft.mediaIds.includes(mediaId)) return state;
  if (state.draft.mediaIds.length >= MAX_COMPOSE_MEDIA) return state;
  return {
    ...state,
    draft: {
      ...state.draft,
      mediaIds: [...state.draft.mediaIds, mediaId],
    },
  };
}

/**
 * Immutably removes a media ID from the draft's attachments.
 */
export function removeDraftMedia(state: ComposeDraftState, mediaId: string): ComposeDraftState {
  if (!state.draft.mediaIds.includes(mediaId)) return state;
  return {
    ...state,
    draft: {
      ...state.draft,
      mediaIds: state.draft.mediaIds.filter((id) => id !== mediaId),
    },
  };
}

export type ComposeSubmission =
  | { kind: 'create'; input: CreatePostInput }
  | { kind: 'edit'; postId: string; input: EditPostInput };

/**
 * Builds the typed RPC input for submitting this draft, ensuring fields are sanitized
 * for the target and CW text is cleared if disabled.
 */
export function buildComposeSubmission(
  state: ComposeDraftState,
  clientRequestId: string,
): ComposeSubmission {
  const sanitized = sanitizeDraftForTarget(
    {
      ...state.draft,
      contentWarning: state.cwEnabled ? state.draft.contentWarning : '',
    },
    state.target,
  );

  if (state.target.kind === 'edit') {
    return {
      kind: 'edit',
      postId: state.target.editing.id,
      input: buildEditPostRequest(state.target.editing.id, sanitized),
    };
  }

  return {
    kind: 'create',
    input: buildCreatePostRequest(sanitized, clientRequestId),
  };
}

/**
 * Target-keyed store for preserving drafts across multiple targets without cross-target contamination.
 */
export class ComposeDraftStore {
  private readonly drafts = new Map<string, ComposeDraftState>();

  getDraft(target: ComposeTarget): ComposeDraftState {
    const key = composeTargetKey(target);
    const existing = this.drafts.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const created = createComposeDraftState(target);
    this.drafts.set(key, created);
    return created;
  }

  setDraft(state: ComposeDraftState): void {
    this.drafts.set(state.targetKey, state);
  }

  resetDraft(target: ComposeTarget): ComposeDraftState {
    const fresh = resetComposeDraftState(target);
    this.drafts.set(fresh.targetKey, fresh);
    return fresh;
  }

  clear(): void {
    this.drafts.clear();
  }
}
