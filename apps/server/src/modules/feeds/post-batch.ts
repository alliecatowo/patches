import { Post, PostMedia } from '@patches/database';
import { In, type EntityManager } from 'typeorm';

import { toPostView, type PostMediaSummary, type PostView } from '../posts/post.dto.js';

/**
 * Builds `PostView`s for one page of posts in three queries total, not `2 * N` — fetching
 * media and reply counts one post at a time (the naive translation of `PostService.getPost`'s
 * per-post helpers) would be an obvious N+1 the moment a feed page has more than one post.
 */
export async function toPostViews(
  manager: EntityManager,
  posts: readonly Post[],
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

  return posts.map((post) =>
    toPostView(
      post,
      post.deletedAt !== null ? [] : (mediaByPost.get(post.id) ?? []),
      replyCountByPost.get(post.id) ?? 0,
    ),
  );
}
