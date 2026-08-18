import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Bookmark, Like } from '@patches/database';
import { DataSource } from 'typeorm';

import { FEDERATION_GATEWAY, type FederationGateway } from '../federation/federation-gateway.js';
import { clampLimit, decodeCursor, pageInfoFor } from '../feeds/pagination.js';
import { toPostViews } from '../feeds/post-batch.js';
import { NotificationsService } from '../notifications/notification.service.js';
import { uuidInputSchema, parseInput } from '../posts/validation.js';
import { type PostView } from '../posts/post.dto.js';
import { PostService } from '../posts/post.service.js';
import type { ActorSummary } from '../auth/auth.dto.js';
import { toActorSummary } from '../auth/auth.dto.js';

/**
 * The application service behind `patches.v1.ReactionService` (spec §53).
 *
 * Deliberately reuses `PostService.getPost` rather than duplicating post
 * existence/block-check/counting logic: every like/bookmark write first calls it (which
 * throws `POST_NOT_FOUND` for a missing, deleted, or blocked-either-direction post — spec
 * §62's "B should not interact with A's posts", enforced the same uniform-`NOT_FOUND` way
 * `PostService.getPost`/`listReplies` already do), and every response is built from a second
 * call to it so the returned counts/viewer-state are never computed twice in two places.
 */

export interface ListPostLikersResult {
  actors: ActorSummary[];
  nextCursor: string;
  hasMore: boolean;
}

export interface ListBookmarksResult {
  posts: PostView[];
  nextCursor: string;
  hasMore: boolean;
}

@Injectable()
export class ReactionsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly posts: PostService,
    private readonly notifications: NotificationsService,
    @Inject(FEDERATION_GATEWAY) private readonly federation: FederationGateway,
  ) {}

  /** Delivers `Like` when the post's author is remote (P8-002/P8-003) — no-op for a local
   * post (`FederationGateway.likeRemotePost`'s own check) or when federation is disabled. */
  async likePost(actorId: string, postIdRaw: string): Promise<PostView> {
    const postId = parseInput(uuidInputSchema, postIdRaw);
    const post = await this.posts.getPost(postId, actorId);

    let wasNew = false;
    await this.dataSource.transaction(async (manager) => {
      const likes = manager.getRepository(Like);
      const existing = await likes.findOne({ where: { actorId, postId } });
      if (existing !== null) return;
      try {
        await likes.save(likes.create({ actorId, postId }));
        wasNew = true;
        await this.federation.likeRemotePost(manager, actorId, postId);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    });

    if (wasNew && post.author.id !== actorId) {
      await this.notifications.notifyLike(post.author.id, actorId, postId);
    }
    return this.posts.getPost(postId, actorId);
  }

  /** Idempotent: unliking a post the caller has not liked is not an error. Delivers
   * `Undo(Like)` when the post's author is remote (P8-002/P8-003). */
  async unlikePost(actorId: string, postIdRaw: string): Promise<PostView> {
    const postId = parseInput(uuidInputSchema, postIdRaw);
    await this.posts.getPost(postId, actorId);
    await this.dataSource.transaction(async (manager) => {
      const result = await manager.getRepository(Like).delete({ actorId, postId });
      if ((result.affected ?? 0) > 0) {
        await this.federation.unlikeRemotePost(manager, actorId, postId);
      }
    });
    return this.posts.getPost(postId, actorId);
  }

  async bookmarkPost(actorId: string, postIdRaw: string): Promise<PostView> {
    const postId = parseInput(uuidInputSchema, postIdRaw);
    await this.posts.getPost(postId, actorId);

    await this.dataSource.transaction(async (manager) => {
      const bookmarks = manager.getRepository(Bookmark);
      const existing = await bookmarks.findOne({ where: { actorId, postId } });
      if (existing !== null) return;
      try {
        await bookmarks.save(bookmarks.create({ actorId, postId }));
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    });
    return this.posts.getPost(postId, actorId);
  }

  /** Idempotent: unbookmarking a post the caller has not bookmarked is not an error. */
  async unbookmarkPost(actorId: string, postIdRaw: string): Promise<PostView> {
    const postId = parseInput(uuidInputSchema, postIdRaw);
    await this.posts.getPost(postId, actorId);
    await this.dataSource.getRepository(Bookmark).delete({ actorId, postId });
    return this.posts.getPost(postId, actorId);
  }

  /** The caller's own bookmarks, most-recent first (spec §53 — bookmarks are private, so
   * there is no "whose bookmarks" parameter; it is always the authenticated caller's). */
  async listBookmarks(
    actorId: string,
    cursorRaw: string,
    limit: number,
  ): Promise<ListBookmarksResult> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(Bookmark)
      .createQueryBuilder('bookmark')
      .innerJoinAndSelect('bookmark.post', 'post')
      .innerJoinAndSelect('post.authorActor', 'author')
      .where('bookmark.actorId = :actorId', { actorId })
      .orderBy('bookmark.createdAt', 'DESC')
      .addOrderBy('bookmark.postId', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(bookmark.createdAt, bookmark.postId) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const posts = await toPostViews(
      this.dataSource.manager,
      page.map((row) => row.post),
      actorId,
    );
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.postId,
    }));
    return { posts, nextCursor, hasMore };
  }

  /** Actors who liked `postId`, most-recent first. Anonymous-callable — `viewerActorId` is
   * only used for `PostService.getPost`'s block check, same as `GetPost`/`ListReplies`. */
  async listPostLikers(
    postIdRaw: string,
    cursorRaw: string,
    limit: number,
    viewerActorId?: string,
  ): Promise<ListPostLikersResult> {
    const postId = parseInput(uuidInputSchema, postIdRaw);
    await this.posts.getPost(postId, viewerActorId);

    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(Like)
      .createQueryBuilder('like')
      .innerJoinAndSelect('like.actor', 'actor')
      .where('like.postId = :postId', { postId })
      .orderBy('like.createdAt', 'DESC')
      .addOrderBy('like.actorId', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(like.createdAt, like.actorId) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const actors = page.map((row) => toActorSummary(row.actor));
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.actorId,
    }));
    return { actors, nextCursor, hasMore };
  }
}

/** PostgreSQL's `unique_violation` SQLSTATE, surfaced by `pg` as a plain `{ code: string }` —
 * same helper `PostService`/`GraphService` use for their own idempotency races. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
