import type {
  Actor as ActorEntity,
  Post as PostEntity,
  PostType as DbPostType,
  PostVisibility as DbPostVisibility,
  QuotePolicy as DbQuotePolicy,
} from '@patches/database';

import { toActorSummary, type ActorSummary } from '../auth/auth.dto.js';
import type { FilteredByHintView } from '../filters/filter.dto.js';
import type { LabelView } from '../labels/label.dto.js';

/**
 * `PostService`'s own vocabulary (spec §128–129) — a `Post`/`Media` entity never reaches
 * `PostController`. Reuses `auth.dto.ts`'s `ActorSummary`/`toActorSummary` for the embedded
 * author: it is exactly the lightweight, zero-counts actor shape `Post.author` needs, and
 * `AuthModule` is already a dependency of every feature module for `AuthGuard`.
 */

export interface PostMediaSummary {
  mediaId: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  position: number;
}

export interface PostCountsView {
  replyCount: number;
  likeCount: number;
  /** Pointer rows in `reposts` (spec §180.1) — never affected by editing/pinning/quoting. */
  repostCount: number;
  /** `posts` rows with `quotedPostId` pointing at this post, excluding tombstoned quotes
   * (spec §180.2). */
  quoteCount: number;
}

/** Only meaningful for an authenticated viewer — every field `false` for an anonymous read,
 * same as `PostViewerState` on the wire (spec §53, §180.1). */
export interface PostViewerStateView {
  liked: boolean;
  bookmarked: boolean;
  reposted: boolean;
}

/**
 * Embedded community reference for `Post.community` (spec §189, §190) — deliberately
 * counts-less/creator-less, same "not loaded here" reasoning `auth.mapper.ts#toProtoActor`
 * documents for `Post.author`: this is a lightweight badge on a post, not
 * `CommunityService.GetCommunity`'s full projection.
 */
export interface CommunitySummaryView {
  id: string;
  name: string;
  displayName: string;
  description: string;
  rules: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostView {
  id: string;
  author: ActorSummary;
  /** `null` once `deleted` is true — the tombstone rule (§25) is enforced here, not left to
   * the mapper, so a caller of `PostService` can never accidentally leak a deleted body. */
  body: string | null;
  postType: DbPostType;
  linkUrl: string | null;
  visibility: DbPostVisibility;
  /** `null` once `deleted` is true — same tombstone rule as `body` (B-018). */
  contentWarning: string | null;
  inReplyToId: string | null;
  rootPostId: string;
  media: PostMediaSummary[];
  createdAt: Date;
  editedAt: Date | null;
  deleted: boolean;
  counts: PostCountsView;
  viewerState: PostViewerStateView;
  /** Unset unless this post quotes another (spec §180.2, §189). */
  quotedPostId: string | null;
  /**
   * Unset unless this post quotes another *and* the quoted post is populated. Only one level
   * deep — this nested view's own `quotedPost` is always `null` (spec §180.2's "quoted-post
   * nesting renders one level"; the caller is responsible for never populating a second
   * level, see `post.service.ts#quotedPostViewOf`/`feeds/post-batch.ts`).
   */
  quotedPost: PostView | null;
  /** Unset for a post not posted into a community (spec §189). Immutable after creation. */
  community: CommunitySummaryView | null;
  quotePolicy: DbQuotePolicy;
  /** Feed-only repost attribution; ordinary post reads leave this empty. */
  repostedBy: ActorSummary[];
  repostedByTotal: number;
  /** Populated only for labelers the viewer subscribes to (spec §200.3, §203) — empty means
   * either "no labels" or "the viewer isn't a subscriber of whichever labelers labeled this",
   * indistinguishably by design (labeler subscriber lists/counts are never published, §208).
   * Only wired for feed reads so far (`feeds/post-batch.ts` via `modules/labels`'
   * `labelsForPosts`); a caller that builds a `PostView` without passing `extras.labels` gets
   * an honestly-empty list rather than a guess (P14-009). */
  labels: LabelView[];
  /** Set only when a viewer's own filter or filter-list subscription matched this post with
   * `collapse`/`warn` (spec §198.3, §199.3, §203) — `null` for a `hide` match (that post is
   * never returned at all, see `feeds/feed.service.ts`) and `null` when nothing matched. Only
   * wired for feed reads (`feeds/feed.service.ts`); a caller that builds a `PostView` without
   * passing `extras.filteredBy` gets an honest `null` rather than a guess — same pattern
   * `labels` above documents for P14-009, applied here for P14-007/P14-008. Filters are
   * deliberately never evaluated for a thread/profile read (spec §198.3 — "threads and
   * profiles are deliberately not filterable in v1"), so `PostService.getPost`/`listReplies`/
   * `listActorPosts` always pass this as unset too. */
  filteredBy: FilteredByHintView | null;
  /** `null` for a post authored on this node (spec §163) — the mapper turns this into the
   * wire's empty string, same convention as `ActorSummary.homeServer`. */
  originServer: string | null;
}

export interface ToPostViewExtras {
  quotedPost?: PostView | null;
  community?: CommunitySummaryView | null;
  repostedBy?: readonly ActorSummary[];
  repostedByTotal?: number;
  labels?: readonly LabelView[];
  filteredBy?: FilteredByHintView | null;
}

/**
 * `post.authorActor` must already be loaded by the caller (`relations` or an explicit join) —
 * this never issues a query of its own. Same for `extras.quotedPost`/`extras.community`
 * (spec §189) — both are resolved by the caller (`PostService`/`feeds/post-batch.ts`) so this
 * function stays a pure mapper, never a query issuer.
 */
export function toPostView(
  post: PostEntity & { authorActor: ActorEntity },
  media: readonly PostMediaSummary[],
  counts: PostCountsView,
  viewerState: PostViewerStateView,
  extras: ToPostViewExtras = {},
): PostView {
  const deleted = post.deletedAt !== null;
  return {
    id: post.id,
    author: toActorSummary(post.authorActor),
    body: deleted ? null : post.body,
    postType: post.postType,
    linkUrl: deleted ? null : post.linkUrl,
    visibility: post.visibility,
    contentWarning: deleted ? null : post.contentWarning,
    inReplyToId: post.inReplyToId,
    rootPostId: post.rootPostId,
    media: deleted ? [] : [...media],
    createdAt: post.createdAt,
    editedAt: post.editedAt,
    deleted,
    counts,
    // A deleted post's like/bookmark/reposted state is meaningless to show — zeroed like
    // every other deleted-post field above, not left to whatever the last real value
    // happened to be.
    viewerState: deleted ? { liked: false, bookmarked: false, reposted: false } : viewerState,
    quotedPostId: deleted ? null : post.quotedPostId,
    quotedPost: deleted ? null : (extras.quotedPost ?? null),
    community: deleted ? null : (extras.community ?? null),
    quotePolicy: post.quotePolicy,
    repostedBy: [...(extras.repostedBy ?? [])].slice(0, 3),
    repostedByTotal: extras.repostedByTotal ?? 0,
    labels: deleted ? [] : [...(extras.labels ?? [])],
    filteredBy: deleted ? null : (extras.filteredBy ?? null),
    originServer: post.originServer,
  };
}

/** One immutable `post_edits` snapshot (spec §186.1, §189) — the state a post carried
 * immediately *before* the `EditPost` call that wrote this row. */
export interface PostEditView {
  id: string;
  postId: string;
  previousBody: string | null;
  previousContentWarning: string | null;
  previousMedia: PostMediaSummary[];
  editedByActorId: string | null;
  createdAt: Date;
}
