import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Post } from '@patches/database';
import { DataSource, type SelectQueryBuilder } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { type PostView } from '../posts/post.dto.js';
import { clampLimit, decodeCursor, pageInfoFor } from './pagination.js';
import { toPostViews } from './post-batch.js';

/**
 * The application service behind `patches.v1.FeedService` (spec §52, §59): chronological,
 * fan-out-on-read lists — never a ranked/recommended feed (§153).
 */

export interface FeedPage {
  posts: PostView[];
  nextCursor: string;
  hasMore: boolean;
}

@Injectable()
export class FeedService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * The caller's home timeline: own posts + posts by followed actors, fan-out-on-read,
   * chronological (spec §52, §59). Always requires a viewer — `FeedController` gates this
   * behind `AuthGuard`.
   */
  async listHomeFeed(viewerActorId: string, cursorRaw: string, limit: number): Promise<FeedPage> {
    const qb = this.baseQuery(viewerActorId).andWhere(
      // Fully-qualified, quoted column reference (`"post"."author_actor_id"`), not
      // `post.authorActorId` — TypeORM's alias.property -> column substitution is unreliable
      // once the same property is referenced more than once inside a multi-line raw
      // condition (verified empirically: it silently left the second occurrence
      // un-substituted, which Postgres then read as the unquoted, lowercased identifier
      // `authoractorid` and rejected as "column does not exist").
      `("post"."author_actor_id" = :homeViewerActorId
        OR EXISTS (
          SELECT 1 FROM follows home_follow
          WHERE home_follow.follower_actor_id = :homeViewerActorId
            AND home_follow.followee_actor_id = "post"."author_actor_id"
        ))`,
      { homeViewerActorId: viewerActorId },
    );
    return this.page(qb, cursorRaw, limit, viewerActorId);
  }

  /** All local public/unlisted posts, chronological (spec §52). `viewerActorId` is optional —
   * an anonymous caller still sees the public feed, just without block/mute/FOLLOWERS-visible
   * filtering (there is no viewer to filter for). */
  async listLocalFeed(cursorRaw: string, limit: number, viewerActorId?: string): Promise<FeedPage> {
    const qb = this.baseQuery(viewerActorId).andWhere('post.isLocal = true');
    return this.page(qb, cursorRaw, limit, viewerActorId);
  }

  /** A given actor's posts, chronological (spec §52). See {@link listLocalFeed} on
   * `viewerActorId` being optional. */
  async listActorPosts(
    actorId: string,
    cursorRaw: string,
    limit: number,
    viewerActorId?: string,
  ): Promise<FeedPage> {
    if (actorId.length === 0) {
      throw AppError.validation('actor_id is required.');
    }
    const qb = this.baseQuery(viewerActorId).andWhere('post.authorActorId = :actorId', {
      actorId,
    });
    return this.page(qb, cursorRaw, limit, viewerActorId);
  }

  // ---------------------------------------------------------------- internals

  private baseQuery(viewerActorId?: string): SelectQueryBuilder<Post> {
    const qb = this.dataSource
      .getRepository(Post)
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.authorActor', 'author')
      .orderBy('post.createdAt', 'DESC')
      .addOrderBy('post.id', 'DESC');
    applyVisibilityFilter(qb, viewerActorId);
    return qb;
  }

  private async page(
    qb: SelectQueryBuilder<Post>,
    cursorRaw: string,
    limit: number,
    viewerActorId?: string,
  ): Promise<FeedPage> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);
    qb.take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(post.createdAt, post.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const posts = await toPostViews(this.dataSource.manager, page, viewerActorId);
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
    return { posts, nextCursor, hasMore };
  }
}

/**
 * Visibility + block/mute filtering seam (spec §59, §62–63), shared by every list here so
 * `ListLocalFeed`/`ListActorPosts` get the same rules `ListHomeFeed` needs, not a narrower
 * copy.
 *
 * With no `viewerActorId` (anonymous caller): only `PUBLIC`/`UNLISTED` posts, exactly as
 * before P3-002 — there is no viewer to test a `FOLLOWERS` post or a block/mute against.
 *
 * With a `viewerActorId`: `PUBLIC`/`UNLISTED` posts, plus the viewer's own posts of any
 * visibility, plus `FOLLOWERS`-visibility posts by actors the viewer follows (spec §59's
 * "visibility permits current_actor" — now that a follow model exists, this is no longer
 * degraded to "public only"). Then, symmetrically, posts by an actor the viewer blocks or who
 * blocks the viewer are excluded in either direction (§62: "A should not see B... B should not
 * see A"), and posts by an actor the viewer mutes are excluded (§63).
 */
function applyVisibilityFilter(qb: SelectQueryBuilder<Post>, viewerActorId?: string): void {
  qb.andWhere('post.deletedAt IS NULL');

  if (viewerActorId === undefined) {
    qb.andWhere('post.visibility IN (:...anonymousVisibilities)', {
      anonymousVisibilities: ['PUBLIC', 'UNLISTED'],
    });
    return;
  }

  // Fully-qualified, quoted column references (`"post"."author_actor_id"`), not
  // `post.authorActorId` — see the comment in `listHomeFeed` on why the camelCase alias form
  // is unsafe once a property is referenced more than once inside one raw condition.
  qb.andWhere(
    `(post.visibility IN (:...publicVisibilities)
      OR "post"."author_actor_id" = :viewerActorId
      OR EXISTS (
        SELECT 1 FROM follows visibility_follow
        WHERE visibility_follow.follower_actor_id = :viewerActorId
          AND visibility_follow.followee_actor_id = "post"."author_actor_id"
      ))`,
    { publicVisibilities: ['PUBLIC', 'UNLISTED'], viewerActorId },
  );
  qb.andWhere(
    `NOT EXISTS (
      SELECT 1 FROM blocks visibility_block
      WHERE (visibility_block.blocker_actor_id = :viewerActorId
             AND visibility_block.blocked_actor_id = "post"."author_actor_id")
         OR (visibility_block.blocker_actor_id = "post"."author_actor_id"
             AND visibility_block.blocked_actor_id = :viewerActorId)
    )`,
    { viewerActorId },
  );
  qb.andWhere(
    `NOT EXISTS (
      SELECT 1 FROM mutes visibility_mute
      WHERE visibility_mute.muter_actor_id = :viewerActorId
        AND visibility_mute.muted_actor_id = "post"."author_actor_id"
    )`,
    { viewerActorId },
  );
}
