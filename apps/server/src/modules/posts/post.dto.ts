import type {
  Actor as ActorEntity,
  Post as PostEntity,
  PostType as DbPostType,
  PostVisibility as DbPostVisibility,
} from '@patches/database';

import { toActorSummary, type ActorSummary } from '../auth/auth.dto.js';

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
  replyCount: number;
}

/**
 * `post.authorActor` must already be loaded by the caller (`relations` or an explicit join) —
 * this never issues a query of its own.
 */
export function toPostView(
  post: PostEntity & { authorActor: ActorEntity },
  media: readonly PostMediaSummary[],
  replyCount: number,
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
    replyCount,
  };
}
