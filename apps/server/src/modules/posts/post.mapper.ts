import type {
  PostType as DbPostType,
  PostVisibility as DbPostVisibility,
  QuotePolicy as DbQuotePolicy,
} from '@patches/database';
import { dateToTimestamp } from '@patches/proto';
import type {
  Community as ProtoCommunity,
  MediaAttachment,
  Post as ProtoPost,
  PostEdit as ProtoPostEdit,
} from '@patches/proto';
import { CommunityRole, PostType, PostVisibility, QuotePolicy } from '@patches/proto/nest';

import { toProtoActor } from '../auth/auth.mapper.js';
import type { CommunitySummaryView, PostEditView, PostMediaSummary, PostView } from './post.dto.js';

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

const QUOTE_POLICY_TO_PROTO: Readonly<Record<DbQuotePolicy, QuotePolicy>> = Object.freeze({
  ANYONE: QuotePolicy.QUOTE_POLICY_ANYONE,
  FOLLOWERS: QuotePolicy.QUOTE_POLICY_FOLLOWERS,
  NOBODY: QuotePolicy.QUOTE_POLICY_NOBODY,
});

/** `QUOTE_POLICY_UNSPECIFIED` (an unset request field) defaults to `ANYONE` — spec §180.2's
 * documented default for the actor-level preference this maps a per-post override onto. */
const PROTO_TO_QUOTE_POLICY: Readonly<Partial<Record<QuotePolicy, DbQuotePolicy>>> = Object.freeze({
  [QuotePolicy.QUOTE_POLICY_ANYONE]: 'ANYONE',
  [QuotePolicy.QUOTE_POLICY_FOLLOWERS]: 'FOLLOWERS',
  [QuotePolicy.QUOTE_POLICY_NOBODY]: 'NOBODY',
});

export function quotePolicyFromProto(value: QuotePolicy): DbQuotePolicy {
  return PROTO_TO_QUOTE_POLICY[value] ?? 'ANYONE';
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

/** `Post.community` (spec §189, §190) — see `post.dto.ts`'s `CommunitySummaryView` doc for why
 * `counts`/`created_by`/`viewer_role` are left unset here rather than guessed at. */
function toProtoCommunitySummary(summary: CommunitySummaryView): ProtoCommunity {
  return {
    id: summary.id,
    name: summary.name,
    displayName: summary.displayName,
    description: summary.description,
    rules: summary.rules,
    createdBy: undefined,
    isPublic: summary.isPublic,
    createdAt: dateToTimestamp(summary.createdAt),
    updatedAt: dateToTimestamp(summary.updatedAt),
    counts: undefined,
    viewerRole: CommunityRole.COMMUNITY_ROLE_UNSPECIFIED,
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
    counts: {
      replies: view.counts.replyCount,
      likes: view.counts.likeCount,
      reposts: view.counts.repostCount,
      quotes: view.counts.quoteCount,
    },
    viewerState: {
      liked: view.viewerState.liked,
      bookmarked: view.viewerState.bookmarked,
      reposted: view.viewerState.reposted,
    },
    // Only one level ever populated (spec §180.2, §188's "quoted post nesting: 1 level
    // rendered") — `view.quotedPost.quotedPost` is always `null` by construction
    // (`post.dto.ts#toPostView`'s doc comment), so this is never a real recursion.
    quotedPost: view.quotedPost === null ? undefined : toProtoPost(view.quotedPost),
    community: view.community === null ? undefined : toProtoCommunitySummary(view.community),
    quotePolicy: QUOTE_POLICY_TO_PROTO[view.quotePolicy],
    repostedBy: view.repostedBy.map(toProtoActor),
    repostedByTotal: view.repostedBy.length === 0 ? 0 : view.repostedByTotal,
    // P14-001 lands the `patches.v1` contract only (spec §198.3, §200.3) — the filter/label
    // evaluation chokepoint is a follow-up task, so every post is honestly unfiltered and
    // unlabeled here rather than guessed at.
    filteredBy: undefined,
    labels: [],
  };
}

export function toProtoPostEdit(view: PostEditView): ProtoPostEdit {
  return {
    id: view.id,
    postId: view.postId,
    previousBody: view.previousBody ?? '',
    previousContentWarning: view.previousContentWarning ?? '',
    previousMedia: view.previousMedia.map(toProtoMediaAttachment),
    editedByActorId: view.editedByActorId ?? '',
    createdAt: dateToTimestamp(view.createdAt),
  };
}
