import { Follow, type Post } from '@patches/database';
import type { EntityManager, ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/**
 * Single-post visibility rules for by-id reads (audit S-H1). Feeds already apply
 * `FeedService.applyVisibilityFilter`; this is the equivalent for reads that start from a
 * post id (GetPost, ListReplies, ListPostEdits, quote embeds, reactions, bookmarks).
 *
 * A post is visible to a viewer when it is PUBLIC or UNLISTED, the viewer wrote it, or the
 * viewer follows its author (`status = 'FOLLOWING'`). Deletion is a separate concern: a
 * tombstone keeps its place in a thread, so these helpers never look at `deletedAt`.
 */
type VisibilityFields = Pick<Post, 'visibility' | 'authorActorId'>;

const OPEN_VISIBILITIES = ['PUBLIC', 'UNLISTED'];

function isOpen(post: VisibilityFields): boolean {
  return OPEN_VISIBILITIES.includes(post.visibility);
}

/** Authors of `posts` whose FOLLOWERS-only posts `viewerActorId` may read. */
async function followedAuthorIds(
  manager: EntityManager,
  viewerActorId: string,
  authorIds: readonly string[],
): Promise<Set<string>> {
  if (authorIds.length === 0) return new Set();
  const rows = await manager
    .getRepository(Follow)
    .createQueryBuilder('follow')
    .select('follow.followeeActorId', 'followeeActorId')
    .where('follow.followerActorId = :viewerActorId', { viewerActorId })
    .andWhere('follow.followeeActorId IN (:...authorIds)', { authorIds })
    .andWhere("follow.status = 'FOLLOWING'")
    .getRawMany<{ followeeActorId: string }>();
  return new Set(rows.map((row) => row.followeeActorId));
}

/** The subset of `posts` that `viewerActorId` (undefined = anonymous) may read. Order kept. */
export async function filterVisiblePosts<T extends VisibilityFields>(
  manager: EntityManager,
  posts: readonly T[],
  viewerActorId: string | undefined,
): Promise<T[]> {
  const restricted = posts.filter((post) => !isOpen(post) && post.authorActorId !== viewerActorId);
  if (restricted.length === 0) return [...posts];
  if (viewerActorId === undefined) return posts.filter(isOpen);
  const followed = await followedAuthorIds(manager, viewerActorId, [
    ...new Set(restricted.map((post) => post.authorActorId)),
  ]);
  return posts.filter(
    (post) =>
      isOpen(post) || post.authorActorId === viewerActorId || followed.has(post.authorActorId),
  );
}

export async function isPostVisibleTo(
  manager: EntityManager,
  post: VisibilityFields,
  viewerActorId: string | undefined,
): Promise<boolean> {
  return (await filterVisiblePosts(manager, [post], viewerActorId)).length === 1;
}

/**
 * SQL form of the same rule for list queries. Does not filter `deletedAt`. `alias` must be
 * the entity alias of the posts table in `qb`; `key` keeps parameter names unique.
 */
export function applyPostVisibilityPredicate<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  viewerActorId: string | undefined,
  alias: string,
  key: string,
): void {
  const open = `${key}Open`;
  if (viewerActorId === undefined) {
    qb.andWhere(`${alias}.visibility IN (:...${open})`, { [open]: OPEN_VISIBILITIES });
    return;
  }
  const viewer = `${key}Viewer`;
  qb.andWhere(
    `(${alias}.visibility IN (:...${open})
      OR "${alias}"."author_actor_id" = :${viewer}
      OR EXISTS (
        SELECT 1 FROM follows ${key}_follow
        WHERE ${key}_follow.follower_actor_id = :${viewer}
          AND ${key}_follow.followee_actor_id = "${alias}"."author_actor_id"
          AND ${key}_follow.status = 'FOLLOWING'
      ))`,
    { [open]: OPEN_VISIBILITIES, [viewer]: viewerActorId },
  );
}
