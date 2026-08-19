import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Community, CommunityMember, Post, Repost, Tag } from '@patches/database';
import { DataSource, type ObjectLiteral, type SelectQueryBuilder } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { toActorSummary } from '../auth/auth.dto.js';
import { type PostView } from '../posts/post.dto.js';
import { parseInput, uuidInputSchema } from '../posts/validation.js';
import { parseTags } from '../tags/tag-extraction.service.js';
import { clampLimit, decodeCursor, encodeCursor, pageInfoFor, type Cursor } from './pagination.js';
import { toPostViews } from './post-batch.js';

/**
 * Chronological, fan-out-on-read feeds. Home-feed repost occurrences are ordered by the
 * repost pointer's own timestamp while the underlying post's `createdAt` remains untouched.
 * Duplicate collapse is intentionally page-local: a post can repeat across a keyset page
 * boundary, the accepted v0 limitation documented by §180.1.
 */
export interface FeedPage {
  posts: PostView[];
  nextCursor: string;
  hasMore: boolean;
}

interface HomeOccurrence {
  post: Post;
  occurredAt: Date;
  occurrenceId: string;
  reposter: Repost['actor'] | null;
}

@Injectable()
export class FeedService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listHomeFeed(viewerActorId: string, cursorRaw: string, limit: number): Promise<FeedPage> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);
    // Overfetch to absorb duplicates before the page-local collapse. Work remains bounded.
    const scanTake = take * 4 + 1;

    const originals = this.baseQuery(viewerActorId).andWhere(
      `("post"."author_actor_id" = :homeViewerActorId OR EXISTS (
        SELECT 1 FROM follows home_follow
        WHERE home_follow.follower_actor_id = :homeViewerActorId
          AND home_follow.followee_actor_id = "post"."author_actor_id"
      ))`,
      { homeViewerActorId: viewerActorId },
    );
    applyTagMuteFilter(originals, viewerActorId, 'post');
    if (cursor !== undefined) applyCursor(originals, 'post', cursor);
    originals.take(scanTake);

    const reposts = this.dataSource
      .getRepository(Repost)
      .createQueryBuilder('repost')
      .innerJoinAndSelect('repost.post', 'repostedPost')
      .innerJoinAndSelect('repostedPost.authorActor', 'repostedAuthor')
      .innerJoinAndSelect('repost.actor', 'reposter')
      .where(
        `("repost"."actor_id" = :homeViewerActorId OR EXISTS (
          SELECT 1 FROM follows repost_follow
          WHERE repost_follow.follower_actor_id = :homeViewerActorId
            AND repost_follow.followee_actor_id = "repost"."actor_id"
        ))`,
        { homeViewerActorId: viewerActorId },
      )
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM blocks reposter_block
          WHERE (reposter_block.blocker_actor_id = :homeViewerActorId
                 AND reposter_block.blocked_actor_id = "repost"."actor_id")
             OR (reposter_block.blocker_actor_id = "repost"."actor_id"
                 AND reposter_block.blocked_actor_id = :homeViewerActorId)
        )`,
        { homeViewerActorId: viewerActorId },
      )
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM mutes reposter_mute
          WHERE reposter_mute.muter_actor_id = :homeViewerActorId
            AND reposter_mute.muted_actor_id = "repost"."actor_id"
        )`,
        { homeViewerActorId: viewerActorId },
      )
      .orderBy('repost.createdAt', 'DESC')
      .addOrderBy('repost.id', 'DESC')
      .take(scanTake);
    applyVisibilityFilter(reposts, viewerActorId, 'repostedPost');
    applyTagMuteFilter(reposts, viewerActorId, 'repostedPost');
    if (cursor !== undefined) applyCursor(reposts, 'repost', cursor);

    const [originalRows, repostRows] = await Promise.all([originals.getMany(), reposts.getMany()]);
    const occurrences: HomeOccurrence[] = [
      ...originalRows.map((post) => ({
        post,
        occurredAt: post.createdAt,
        occurrenceId: post.id,
        reposter: null,
      })),
      ...repostRows.map((repost) => ({
        post: repost.post,
        occurredAt: repost.createdAt,
        occurrenceId: repost.id,
        reposter: repost.actor,
      })),
    ].sort(compareOccurrences);

    const repostersByPost = new Map<string, Repost['actor'][]>();
    for (const occurrence of occurrences) {
      if (occurrence.reposter === null) continue;
      const actors = repostersByPost.get(occurrence.post.id) ?? [];
      if (!actors.some((actor) => actor.id === occurrence.reposter!.id))
        actors.push(occurrence.reposter);
      repostersByPost.set(occurrence.post.id, actors);
    }

    const collapsed: HomeOccurrence[] = [];
    const seen = new Set<string>();
    for (const occurrence of occurrences) {
      if (seen.has(occurrence.post.id)) continue;
      seen.add(occurrence.post.id);
      collapsed.push(occurrence);
      if (collapsed.length > take) break;
    }
    const hasMore = collapsed.length > take;
    const page = hasMore ? collapsed.slice(0, take) : collapsed;
    const views = await toPostViews(
      this.dataSource.manager,
      page.map((row) => row.post),
      viewerActorId,
    );
    const posts = views.map((view) => {
      const reposters = repostersByPost.get(view.id) ?? [];
      return {
        ...view,
        repostedBy: reposters.slice(0, 3).map(toActorSummary),
        repostedByTotal: reposters.length,
      };
    });
    const tail = page.at(-1);
    return {
      posts,
      nextCursor:
        hasMore && tail !== undefined
          ? encodeCursor({ createdAt: tail.occurredAt, id: tail.occurrenceId })
          : '',
      hasMore,
    };
  }

  async listLocalFeed(cursorRaw: string, limit: number, viewerActorId?: string): Promise<FeedPage> {
    const qb = this.baseQuery(viewerActorId).andWhere('post.isLocal = true');
    if (viewerActorId !== undefined) applyTagMuteFilter(qb, viewerActorId, 'post');
    if (viewerActorId === undefined) {
      qb.andWhere('post.communityId IS NULL');
    } else {
      qb.andWhere(
        `(post.communityId IS NULL OR EXISTS (
          SELECT 1 FROM community_members local_member
          WHERE local_member.community_id = "post"."community_id"
            AND local_member.actor_id = :localViewerActorId
        ))`,
        { localViewerActorId: viewerActorId },
      );
    }
    return this.page(qb, cursorRaw, limit, viewerActorId);
  }

  async listActorPosts(
    actorId: string,
    cursorRaw: string,
    limit: number,
    viewerActorId?: string,
  ): Promise<FeedPage> {
    const id = parseInput(uuidInputSchema, actorId);
    return this.page(
      this.baseQuery(viewerActorId).andWhere('post.authorActorId = :actorId', { actorId: id }),
      cursorRaw,
      limit,
      viewerActorId,
    );
  }

  async listTagFeed(
    tagRaw: string,
    cursorRaw: string,
    limit: number,
    viewerActorId?: string,
  ): Promise<FeedPage> {
    const canonical = parseTags(`#${tagRaw.trim()}`)[0];
    if (canonical === undefined) throw AppError.validation('tag is invalid.');
    const tag = await this.dataSource.getRepository(Tag).findOne({ where: { name: canonical } });
    if (tag === null) return { posts: [], nextCursor: '', hasMore: false };

    if (viewerActorId !== undefined) {
      const muted = await this.dataSource.query<Array<{ found: boolean }>>(
        'SELECT true AS found FROM tag_mutes WHERE actor_id = $1 AND tag_id = $2 LIMIT 1',
        [viewerActorId, tag.id],
      );
      if (muted.length > 0) return { posts: [], nextCursor: '', hasMore: false };
    }

    const qb = this.baseQuery(viewerActorId)
      .innerJoin('post_tags', 'requested_tag', 'requested_tag.post_id = post.id')
      .andWhere('requested_tag.tag_id = :tagId', { tagId: tag.id })
      .andWhere('post.visibility = :tagVisibility', { tagVisibility: 'PUBLIC' });
    if (viewerActorId === undefined) {
      qb.andWhere('post.communityId IS NULL');
    } else {
      qb.andWhere(
        `(post.communityId IS NULL OR EXISTS (
          SELECT 1 FROM community_members tag_member
          WHERE tag_member.community_id = "post"."community_id"
            AND tag_member.actor_id = :tagViewerActorId
        ))`,
        { tagViewerActorId: viewerActorId },
      );
      applyTagMuteFilter(qb, viewerActorId, 'post');
    }
    return this.page(qb, cursorRaw, limit, viewerActorId);
  }

  async listCommunityFeed(
    communityIdRaw: string,
    cursorRaw: string,
    limit: number,
    viewerActorId?: string,
  ): Promise<FeedPage> {
    const communityId = parseInput(uuidInputSchema, communityIdRaw);
    const community = await this.dataSource
      .getRepository(Community)
      .findOne({ where: { id: communityId } });
    if (community === null) throw AppError.validation('That community does not exist.');
    if (!community.isPublic) {
      if (viewerActorId === undefined) throw AppError.validation('That community does not exist.');
      const membership = await this.dataSource.getRepository(CommunityMember).findOne({
        where: { communityId, actorId: viewerActorId },
      });
      if (membership === null) throw AppError.validation('That community does not exist.');
    }
    return this.page(
      this.baseQuery(viewerActorId).andWhere('post.communityId = :communityId', { communityId }),
      cursorRaw,
      limit,
      viewerActorId,
    );
  }

  private baseQuery(viewerActorId?: string): SelectQueryBuilder<Post> {
    const qb = this.dataSource
      .getRepository(Post)
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.authorActor', 'author')
      .orderBy('post.createdAt', 'DESC')
      .addOrderBy('post.id', 'DESC');
    applyVisibilityFilter(qb, viewerActorId, 'post');
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
    if (cursor !== undefined) applyCursor(qb, 'post', cursor);
    qb.take(take + 1);
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
 * Exported so `PostService.searchPosts` (`modules/posts/post.service.ts`) can apply the exact
 * same block/mute/`FOLLOWERS`-visibility rules `ListLocalFeed` does, rather than duplicating
 * this query (spec §62). Both modules are `apps/server`-internal — this is a plain function
 * import, not a cross-module Nest dependency.
 */
export function applyVisibilityFilter<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  viewerActorId: string | undefined,
  alias: 'post' | 'repostedPost',
): void {
  const table = alias === 'post' ? 'post' : 'repostedPost';
  qb.andWhere(`${alias}.deletedAt IS NULL`);
  if (viewerActorId === undefined) {
    qb.andWhere(`${alias}.visibility IN (:...anonymousVisibilities)`, {
      anonymousVisibilities: ['PUBLIC', 'UNLISTED'],
    });
    return;
  }
  qb.andWhere(
    `(${alias}.visibility IN (:...publicVisibilities)
      OR "${table}"."author_actor_id" = :viewerActorId
      OR EXISTS (
        SELECT 1 FROM follows visibility_follow
        WHERE visibility_follow.follower_actor_id = :viewerActorId
          AND visibility_follow.followee_actor_id = "${table}"."author_actor_id"
      ))`,
    { publicVisibilities: ['PUBLIC', 'UNLISTED'], viewerActorId },
  );
  qb.andWhere(
    `NOT EXISTS (
      SELECT 1 FROM blocks visibility_block
      WHERE (visibility_block.blocker_actor_id = :viewerActorId
             AND visibility_block.blocked_actor_id = "${table}"."author_actor_id")
         OR (visibility_block.blocker_actor_id = "${table}"."author_actor_id"
             AND visibility_block.blocked_actor_id = :viewerActorId)
    )`,
    { viewerActorId },
  );
  qb.andWhere(
    `NOT EXISTS (
      SELECT 1 FROM mutes visibility_mute
      WHERE visibility_mute.muter_actor_id = :viewerActorId
        AND visibility_mute.muted_actor_id = "${table}"."author_actor_id"
    )`,
    { viewerActorId },
  );
}

/** Exported for the same reason {@link applyVisibilityFilter} is — reused by
 * `PostService.searchPosts`. */
export function applyCursor<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: 'post' | 'repost',
  cursor: Cursor,
): void {
  qb.andWhere(`(${alias}.createdAt, ${alias}.id) < (:cursorCreatedAt, :cursorId)`, {
    cursorCreatedAt: cursor.createdAt,
    cursorId: cursor.id,
  });
}

/** Exported for the same reason {@link applyVisibilityFilter} is — reused by
 * `PostService.searchPosts`. */
export function applyTagMuteFilter<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  viewerActorId: string,
  alias: 'post' | 'repostedPost',
): void {
  qb.andWhere(
    `NOT EXISTS (
      SELECT 1 FROM post_tags muted_post_tag
      INNER JOIN tag_mutes muted_tag
        ON muted_tag.tag_id = muted_post_tag.tag_id
       AND muted_tag.actor_id = :mutedTagViewerActorId
      WHERE muted_post_tag.post_id = "${alias}"."id"
    )`,
    { mutedTagViewerActorId: viewerActorId },
  );
}

function compareOccurrences(a: HomeOccurrence, b: HomeOccurrence): number {
  const byTime = b.occurredAt.getTime() - a.occurredAt.getTime();
  return byTime !== 0 ? byTime : b.occurrenceId.localeCompare(a.occurrenceId);
}
