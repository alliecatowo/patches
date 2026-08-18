import type { PostType as DbPostType, PostVisibility as DbPostVisibility } from '@patches/database';
import { dateToTimestamp } from '@patches/proto';
import type { MediaAttachment, Post as ProtoPost } from '@patches/proto';
import { PostType, PostVisibility } from '@patches/proto/nest';

import { toProtoActor } from '../auth/auth.mapper.js';
import type { PostMediaSummary, PostView } from './post.dto.js';

/**
 * Application DTO → protobuf message (spec §128), field-by-field — see `auth.mapper.ts`'s
 * comment on why never a spread.
 */

const POST_TYPE_TO_PROTO: Readonly<Record<DbPostType, PostType>> = Object.freeze({
  NOTE: PostType.POST_TYPE_NOTE,
  LINK: PostType.POST_TYPE_LINK,
});

const POST_VISIBILITY_TO_PROTO: Readonly<Record<DbPostVisibility, PostVisibility>> = Object.freeze({
  PUBLIC: PostVisibility.POST_VISIBILITY_PUBLIC,
  UNLISTED: PostVisibility.POST_VISIBILITY_UNLISTED,
  FOLLOWERS: PostVisibility.POST_VISIBILITY_FOLLOWERS,
});

/** `POST_VISIBILITY_UNSPECIFIED` (an unset request field) defaults to the most restrictive
 * *public-facing* choice the schema has no better name for: `PUBLIC`. There is no "private"
 * visibility in v0 (§23), so this is not silently narrowing anything a client asked for. */
const PROTO_TO_POST_VISIBILITY: Readonly<Partial<Record<PostVisibility, DbPostVisibility>>> =
  Object.freeze({
    [PostVisibility.POST_VISIBILITY_PUBLIC]: 'PUBLIC',
    [PostVisibility.POST_VISIBILITY_UNLISTED]: 'UNLISTED',
    [PostVisibility.POST_VISIBILITY_FOLLOWERS]: 'FOLLOWERS',
  });

export function postVisibilityFromProto(value: PostVisibility): DbPostVisibility {
  return PROTO_TO_POST_VISIBILITY[value] ?? 'PUBLIC';
}

function toProtoMediaAttachment(media: PostMediaSummary): MediaAttachment {
  return {
    mediaId: media.mediaId,
    altText: media.altText ?? '',
    width: media.width ?? 0,
    height: media.height ?? 0,
    mimeType: media.mimeType ?? '',
    position: media.position,
  };
}

export function toProtoPost(view: PostView): ProtoPost {
  return {
    id: view.id,
    author: toProtoActor(view.author),
    body: view.body ?? '',
    postType: POST_TYPE_TO_PROTO[view.postType],
    linkUrl: view.linkUrl ?? '',
    visibility: POST_VISIBILITY_TO_PROTO[view.visibility],
    contentWarning: view.contentWarning ?? '',
    inReplyToId: view.inReplyToId ?? '',
    rootPostId: view.rootPostId,
    media: view.media.map(toProtoMediaAttachment),
    createdAt: dateToTimestamp(view.createdAt),
    editedAt: view.editedAt === null ? undefined : dateToTimestamp(view.editedAt),
    deleted: view.deleted,
    // Likes/bookmarks land with `ReactionService` (Phase 3, spec §53) — zeroed rather than
    // omitted, since `PostCounts`/`PostViewerState` are always-present proto messages.
    counts: { replies: view.replyCount, likes: 0 },
    viewerState: { liked: false, bookmarked: false },
  };
}
