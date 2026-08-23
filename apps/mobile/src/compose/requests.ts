import { MAX_POST_CHARS } from '@patches/domain';
import { PostVisibility, QuotePolicy, type Post } from '@patches/proto/es';
import type { PatchesApi } from '@patches/client';

export type CreatePostInput = Parameters<PatchesApi['posts']['createPost']>[0];
export type EditPostInput = Parameters<PatchesApi['posts']['editPost']>[0];

/** Up to 4 images per post (spec §28) — mirrors `apps/web`'s `ComposeRoute` `MAX_MEDIA`. */
export const MAX_COMPOSE_MEDIA = 4;

/**
 * Shape accepted for node limit resolution — supports `GetNodeInfoResponse`, `NodeLimits`,
 * `SocialCapabilities`, plain numbers, or partial objects with `limits` / `socialCapabilities`.
 */
export type NodeInfoLike =
  | number
  | {
      limits?: { postBodyMaxChars?: number | null | undefined } | null | undefined;
      socialCapabilities?: { maxPostChars?: number | null | undefined } | null | undefined;
      postBodyMaxChars?: number | null | undefined;
      maxPostChars?: number | null | undefined;
    }
  | null
  | undefined;

/**
 * Resolves the maximum post character limit from node info, limits, social capabilities,
 * or an explicit number, falling back to canonical `MAX_POST_CHARS` (5,000) from
 * `@patches/domain` (spec §188).
 */
export function resolveMaxPostChars(info?: NodeInfoLike): number {
  if (typeof info === 'number') {
    return Number.isFinite(info) && info > 0 ? Math.floor(info) : MAX_POST_CHARS;
  }
  if (info !== null && typeof info === 'object') {
    const socialMax = info.socialCapabilities?.maxPostChars;
    if (typeof socialMax === 'number' && Number.isFinite(socialMax) && socialMax > 0) {
      return Math.floor(socialMax);
    }
    const limitsMax = info.limits?.postBodyMaxChars;
    if (typeof limitsMax === 'number' && Number.isFinite(limitsMax) && limitsMax > 0) {
      return Math.floor(limitsMax);
    }
    const directMax = info.maxPostChars;
    if (typeof directMax === 'number' && Number.isFinite(directMax) && directMax > 0) {
      return Math.floor(directMax);
    }
    const directLimitsMax = info.postBodyMaxChars;
    if (
      typeof directLimitsMax === 'number' &&
      Number.isFinite(directLimitsMax) &&
      directLimitsMax > 0
    ) {
      return Math.floor(directLimitsMax);
    }
  }
  return MAX_POST_CHARS;
}

/** Compose form state, independent of whether it becomes a `CreatePost` or `EditPost`
 * call — the same shape composes a root post, a reply, and a quote (`inReplyToId`/
 * `quotedPostId` distinguish which), and seeds an in-place edit. */
export interface ComposeDraft {
  body: string;
  contentWarning: string;
  mediaIds: readonly string[];
  inReplyToId: string;
  quotedPostId: string;
}

export function emptyComposeDraft(): ComposeDraft {
  return { body: '', contentWarning: '', mediaIds: [], inReplyToId: '', quotedPostId: '' };
}

/** Seeds a draft from one of the caller's own posts for `EditPost` (spec §189, §26
 * amended) — never carries `inReplyToId`/`quotedPostId` since editing never changes what
 * a post replies to or quotes. */
export function draftFromPost(
  post:
    | Pick<Post, 'body' | 'contentWarning' | 'media'>
    | {
        body?: string | undefined;
        contentWarning?: string | undefined;
        media?: Post['media'] | undefined;
      },
): ComposeDraft {
  return {
    body: post.body ?? '',
    contentWarning: post.contentWarning ?? '',
    mediaIds: (post.media ?? []).map((media) => media.mediaId),
    inReplyToId: '',
    quotedPostId: '',
  };
}

/** A post must contain at least one of text, an image, or a link (spec §23) — this
 * client never composes a link-only post, so text-or-media is the whole check. Media
 * still mid-upload blocks submit even when the body alone would pass. Character limit
 * defaults to `MAX_POST_CHARS` (5,000) or is resolved from node info. */
export function canSubmitCompose(
  draft: ComposeDraft,
  maxCharsOrInfo: NodeInfoLike = MAX_POST_CHARS,
  uploading = false,
): boolean {
  if (uploading) return false;
  const maxChars = resolveMaxPostChars(maxCharsOrInfo);
  const bodyLength = [...draft.body].length;
  if (bodyLength > maxChars) return false;
  return draft.body.trim() !== '' || draft.mediaIds.length > 0;
}

export function buildCreatePostRequest(
  draft: ComposeDraft,
  clientRequestId: string,
): CreatePostInput {
  return {
    clientRequestId,
    body: draft.body,
    linkUrl: '',
    visibility: PostVisibility.PUBLIC,
    inReplyToId: draft.inReplyToId,
    mediaIds: [...draft.mediaIds],
    contentWarning: draft.contentWarning,
    quotedPostId: draft.quotedPostId,
    communityId: '',
    quotePolicy: QuotePolicy.ANYONE,
  };
}

export function buildEditPostRequest(postId: string, draft: ComposeDraft): EditPostInput {
  return {
    id: postId,
    body: draft.body,
    contentWarning: draft.contentWarning,
    mediaIds: [...draft.mediaIds],
  };
}
