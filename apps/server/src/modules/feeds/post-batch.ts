import { Bookmark, Like, Post, PostMedia } from '@patches/database';
import { In, type EntityManager } from 'typeorm';

import { toPostView, type PostMediaSummary, type PostView } from '../posts/post.dto.js';

/**
 * Builds `PostView`s for one page of posts in a handful of queries total, not `N * queries` —
 * fetching media/counts/viewer-state one post at a time (the naive translation of
 * `PostService.getPost`'s per-post helpers) would be an obvious N+1 the moment a feed page has
 * more than one post.
 *
 * `viewerActorId` is optional — `FeedService.listLocalFeed`/`listActorPosts` and
 * `ReactionsService.listBookmarks` may be called anonymously or by the caller themselves, and
 * with no viewer there is no `liked`/`bookmarked` state to look up (both stay `false`, same as
 * `PostService.viewOf` with no viewer).
 */
export async function toPostViews(
  manager: EntityManager,
  posts: readonly Post[],
  viewerActorId?: string,
): Promise<PostView[]> {
  if (posts.length === 0) return [];
  const ids = posts.map((post) => post.id);

  const mediaRows = await manager.getRepository(PostMedia).find({
    where: { postId: In(ids) },
    relations: { media: true },
    order: { position: 'ASC' },
  });
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

  const replyCountRows = await manager
    .getRepository(Post)
    .createQueryBuilder('post')
    .select('post.inReplyToId', 'parentId')
    .addSelect('COUNT(*)', 'count')
    .where('post.inReplyToId IN (:...ids)', { ids })
    .andWhere('post.deletedAt IS NULL')
    .groupBy('post.inReplyToId')
    .getRawMany<{ parentId: string; count: string }>();
  const replyCountByPost = new Map(replyCountRows.map((row) => [row.parentId, Number(row.count)]));

  const likeCountRows = await manager
    .getRepository(Like)
    .createQueryBuilder('like')
    .select('like.postId', 'postId')
    .addSelect('COUNT(*)', 'count')
    .where('like.postId IN (:...ids)', { ids })
    .groupBy('like.postId')
    .getRawMany<{ postId: string; count: string }>();
  const likeCountByPost = new Map(likeCountRows.map((row) => [row.postId, Number(row.count)]));

  let likedPostIds = new Set<string>();
  let bookmarkedPostIds = new Set<string>();
  if (viewerActorId !== undefined) {
    const [likedRows, bookmarkedRows] = await Promise.all([
      manager.getRepository(Like).find({ where: { actorId: viewerActorId, postId: In(ids) } }),
      manager.getRepository(Bookmark).find({ where: { actorId: viewerActorId, postId: In(ids) } }),
    ]);
    likedPostIds = new Set(likedRows.map((row) => row.postId));
    bookmarkedPostIds = new Set(bookmarkedRows.map((row) => row.postId));
  }

  return posts.map((post) =>
    toPostView(
      post,
      post.deletedAt !== null ? [] : (mediaByPost.get(post.id) ?? []),
      {
        replyCount: replyCountByPost.get(post.id) ?? 0,
        likeCount: likeCountByPost.get(post.id) ?? 0,
      },
      { liked: likedPostIds.has(post.id), bookmarked: bookmarkedPostIds.has(post.id) },
    ),
  );
}
