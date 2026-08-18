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

  /** All local public/unlisted posts, chronological (spec §52). */
  async listLocalFeed(cursorRaw: string, limit: number): Promise<FeedPage> {
    const qb = this.baseQuery().andWhere('post.isLocal = true');
    return this.page(qb, cursorRaw, limit);
  }

  /** A given actor's posts, chronological (spec §52). */
  async listActorPosts(actorId: string, cursorRaw: string, limit: number): Promise<FeedPage> {
    if (actorId.length === 0) {
      throw AppError.validation('actor_id is required.');
    }
    const qb = this.baseQuery().andWhere('post.authorActorId = :actorId', { actorId });
    return this.page(qb, cursorRaw, limit);
  }

  // ---------------------------------------------------------------- internals

  private baseQuery(): SelectQueryBuilder<Post> {
    const qb = this.dataSource
      .getRepository(Post)
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.authorActor', 'author')
      .orderBy('post.createdAt', 'DESC')
      .addOrderBy('post.id', 'DESC');
    applyVisibilityFilter(qb);
    return qb;
  }

  private async page(
    qb: SelectQueryBuilder<Post>,
    cursorRaw: string,
    limit: number,
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

    const posts = await toPostViews(this.dataSource.manager, page);
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
    return { posts, nextCursor, hasMore };
  }
}

/**
 * Visibility (and, later, block/mute) filtering seam (spec §59, §62–63).
 *
 * Block/mute filtering is not implemented yet — `SocialGraphService` (P3-002) will extend
 * this function to also exclude posts by actors the viewer has blocked, or who have blocked
 * the viewer, and posts by actors the viewer has muted. For now it only expresses what v0 can
 * actually check: `FOLLOWERS`-visibility posts are hidden from every list, because there is no
 * follow model yet to test the viewer against (never invented — spec §59's "visibility permits
 * current_actor" degrades to "is this publicly listable" until follows exist).
 */
function applyVisibilityFilter(qb: SelectQueryBuilder<Post>): void {
  qb.andWhere('post.visibility IN (:...visibilities)', { visibilities: ['PUBLIC', 'UNLISTED'] });
  qb.andWhere('post.deletedAt IS NULL');
}
