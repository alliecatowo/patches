import { Bookmark, Like, Post, PostMedia, Repost } from '@patches/database';
import { In, type EntityManager } from 'typeorm';

import { labelsForPosts } from '../labels/label-lookup.js';
import { communitySummariesFor } from '../posts/community-summary.js';
import {
  toPostView,
  type CommunitySummaryView,
  type PostCountsView,
  type PostMediaSummary,
  type PostView,
  type PostViewerStateView,
} from '../posts/post.dto.js';

/**
 * Batched post projection shared by feeds and bookmark lists. Quote embeds are deliberately
 * expanded exactly once; the embedded post is projected with `includeQuotes=false` so a quote
 * chain can never recurse on the wire (§180.2).
 */
export async function toPostViews(
  manager: EntityManager,
  posts: readonly Post[],
  viewerActorId?: string,
): Promise<PostView[]> {
  return buildPostViews(manager, posts, viewerActorId, true);
}

async function buildPostViews(
  manager: EntityManager,
  posts: readonly Post[],
  viewerActorId: string | undefined,
  includeQuotes: boolean,
): Promise<PostView[]> {
  if (posts.length === 0) return [];
  const ids = posts.map((post) => post.id);

  const [mediaRows, replyRows, likeRows, repostRows, quoteRows, viewerRows, labelsByPost] =
    await Promise.all([
      manager.getRepository(PostMedia).find({
        where: { postId: In(ids) },
        relations: { media: true },
        order: { position: 'ASC' },
      }),
      groupedPostCount(manager, 'inReplyToId', ids),
      groupedRelationCount(manager, Like, 'like', ids),
      groupedRelationCount(manager, Repost, 'repost', ids),
      groupedPostCount(manager, 'quotedPostId', ids),
      viewerActorId === undefined
        ? Promise.resolve({
            liked: new Set<string>(),
            bookmarked: new Set<string>(),
            reposted: new Set<string>(),
          })
        : loadViewerState(manager, viewerActorId, ids),
      // `Post.labels` (spec §200.3, §203): subscriber-scoped, populated only for feed reads —
      // see `modules/labels/label-lookup.ts`'s doc for the visibility rule and why this is a
      // plain function call rather than an injected `LabelService` (no DI container here).
      labelsForPosts(manager, ids, viewerActorId),
    ]);

  const mediaByPost = new Map<string, PostMediaSummary[]>();
  for (const row of mediaRows) {
    const list = mediaByPost.get(row.postId) ?? [];
    list.push({
      mediaId: row.mediaId,
      altText: row.media.altText,
      width: row.media.width,
      height: row.media.height,
      mimeType: row.media.mimeType,
      position: row.position,
    });
    mediaByPost.set(row.postId, list);
  }

  const communities = await loadCommunities(manager, posts);
  const quoted: Map<string, PostView> = includeQuotes
    ? await loadQuotedPosts(manager, posts, viewerActorId)
    : new Map<string, PostView>();

  return posts.map((post) => {
    const counts: PostCountsView = {
      replyCount: replyRows.get(post.id) ?? 0,
      likeCount: likeRows.get(post.id) ?? 0,
      repostCount: repostRows.get(post.id) ?? 0,
      quoteCount: quoteRows.get(post.id) ?? 0,
    };
    const viewerState: PostViewerStateView = {
      liked: viewerRows.liked.has(post.id),
      bookmarked: viewerRows.bookmarked.has(post.id),
      reposted: viewerRows.reposted.has(post.id),
    };
    return toPostView(
      post,
      post.deletedAt === null ? (mediaByPost.get(post.id) ?? []) : [],
      counts,
      viewerState,
      {
        quotedPost: post.quotedPostId === null ? null : (quoted.get(post.quotedPostId) ?? null),
        community: post.communityId === null ? null : (communities.get(post.communityId) ?? null),
        labels: labelsByPost.get(post.id) ?? [],
      },
    );
  });
}

async function loadViewerState(manager: EntityManager, actorId: string, postIds: string[]) {
  const [likes, bookmarks, reposts] = await Promise.all([
    manager.getRepository(Like).find({ where: { actorId, postId: In(postIds) } }),
    manager.getRepository(Bookmark).find({ where: { actorId, postId: In(postIds) } }),
    manager.getRepository(Repost).find({ where: { actorId, postId: In(postIds) } }),
  ]);
  return {
    liked: new Set(likes.map((row) => row.postId)),
    bookmarked: new Set(bookmarks.map((row) => row.postId)),
    reposted: new Set(reposts.map((row) => row.postId)),
  };
}

async function groupedRelationCount(
  manager: EntityManager,
  entity: typeof Like | typeof Repost,
  alias: string,
  postIds: string[],
): Promise<Map<string, number>> {
  const rows = await manager
    .getRepository(entity)
    .createQueryBuilder(alias)
    .select(`${alias}.postId`, 'postId')
    .addSelect('COUNT(*)', 'count')
    .where(`${alias}.postId IN (:...postIds)`, { postIds })
    .groupBy(`${alias}.postId`)
    .getRawMany<{ postId: string; count: string }>();
  return new Map(rows.map((row) => [row.postId, Number(row.count)]));
}

async function groupedPostCount(
  manager: EntityManager,
  column: 'inReplyToId' | 'quotedPostId',
  postIds: string[],
): Promise<Map<string, number>> {
  const rows = await manager
    .getRepository(Post)
    .createQueryBuilder('countedPost')
    .select(`countedPost.${column}`, 'postId')
    .addSelect('COUNT(*)', 'count')
    .where(`countedPost.${column} IN (:...postIds)`, { postIds })
    .andWhere('countedPost.deletedAt IS NULL')
    .groupBy(`countedPost.${column}`)
    .getRawMany<{ postId: string; count: string }>();
  return new Map(rows.map((row) => [row.postId, Number(row.count)]));
}

async function loadCommunities(
  manager: EntityManager,
  posts: readonly Post[],
): Promise<Map<string, CommunitySummaryView>> {
  const ids = [
    ...new Set(posts.flatMap((post) => (post.communityId === null ? [] : [post.communityId]))),
  ];
  return communitySummariesFor(manager, ids);
}

async function loadQuotedPosts(
  manager: EntityManager,
  posts: readonly Post[],
  viewerActorId?: string,
): Promise<Map<string, PostView>> {
  const ids = [
    ...new Set(posts.flatMap((post) => (post.quotedPostId === null ? [] : [post.quotedPostId]))),
  ];
  if (ids.length === 0) return new Map();
  const rows = await manager.getRepository(Post).find({
    where: { id: In(ids) },
    relations: { authorActor: true },
  });
  const views = await buildPostViews(manager, rows, viewerActorId, false);
  return new Map(views.map((view) => [view.id, view]));
}
