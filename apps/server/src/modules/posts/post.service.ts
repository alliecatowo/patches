import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Media, Post, PostMedia, type PostVisibility as DbPostVisibility } from '@patches/database';
import { DataSource, In, IsNull, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { clampLimit, decodeCursor, pageInfoFor } from '../feeds/pagination.js';
import { toPostView, type PostMediaSummary, type PostView } from './post.dto.js';
import { createPostInputSchema, parseInput, uuidInputSchema } from './validation.js';

/**
 * The application service behind `patches.v1.PostService` (spec §23–26, §45, §51).
 *
 * Idempotency, tombstoning, and the "text/link/image" constraint (§23) all live here, not in
 * the controller or the database — the unique index and the `link_url` CHECK are backstops,
 * not the primary enforcement (spec §103).
 */

export interface CreatePostInput {
  authorActorId: string;
  clientRequestId: string;
  body?: string;
  linkUrl?: string;
  visibility: DbPostVisibility;
  contentWarning?: string;
  inReplyToId?: string;
  mediaIds: string[];
}

export interface ListRepliesResult {
  posts: PostView[];
  nextCursor: string;
  hasMore: boolean;
}

@Injectable()
export class PostService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Idempotent on `(author_actor_id, client_request_id)` (spec §45): a retried request with
   * the same key returns the original post rather than creating a second one, whether the
   * retry lands before or after the first attempt's row is visible.
   */
  async createPost(input: CreatePostInput): Promise<PostView> {
    const parsed = parseInput(createPostInputSchema, input);

    return this.dataSource.transaction(async (manager) => {
      const posts = manager.getRepository(Post);

      const existing = await posts.findOne({
        where: { authorActorId: input.authorActorId, clientRequestId: parsed.clientRequestId },
        relations: { authorActor: true },
      });
      if (existing !== null) return this.viewOf(manager, existing);

      const id: string = randomUUID();
      let rootPostId: string = id;
      if (parsed.inReplyToId !== undefined) {
        const parent = await posts.findOne({ where: { id: parsed.inReplyToId } });
        if (parent === null || parent.deletedAt !== null) throw postNotFound();
        rootPostId = parent.rootPostId;
      }

      const media = await this.attachableMedia(manager, input.authorActorId, parsed.mediaIds);

      const created = posts.create({
        id,
        authorActorId: input.authorActorId,
        body: parsed.body ?? null,
        postType: parsed.linkUrl !== undefined ? 'LINK' : 'NOTE',
        linkUrl: parsed.linkUrl ?? null,
        visibility: parsed.visibility,
        contentWarning: parsed.contentWarning ?? null,
        inReplyToId: parsed.inReplyToId ?? null,
        rootPostId,
        isLocal: true,
        clientRequestId: parsed.clientRequestId,
      });

      let saved: Post;
      try {
        saved = await posts.save(created);
      } catch (error) {
        // Two concurrent retries of the same client_request_id race the unique index
        // (author_actor_id, client_request_id) directly. The loser refetches instead of
        // erroring — that is what "idempotent" (spec §45) actually requires under a race,
        // not just on a sequential retry.
        if (!isUniqueViolation(error)) throw error;
        const winner = await posts.findOne({
          where: { authorActorId: input.authorActorId, clientRequestId: parsed.clientRequestId },
          relations: { authorActor: true },
        });
        if (winner === null) throw error;
        return this.viewOf(manager, winner);
      }

      if (media.length > 0) {
        const postMedia = manager.getRepository(PostMedia);
        await postMedia.save(
          media.map((row, position) =>
            postMedia.create({ postId: id, mediaId: row.mediaId, position }),
          ),
        );
      }

      const withAuthor = await posts.findOneOrFail({
        where: { id: saved.id },
        relations: { authorActor: true },
      });
      return toPostView(withAuthor, media, 0);
    });
  }

  /**
   * Never throws `POST_NOT_FOUND` for a tombstoned post (spec §25) — only for one that never
   * existed. The caller (`PostController`) renders `[deleted]` off `Post.deleted`.
   */
  async getPost(id: string): Promise<PostView> {
    const parsed = parseInput(uuidInputSchema, id);
    const post = await this.dataSource
      .getRepository(Post)
      .findOne({ where: { id: parsed }, relations: { authorActor: true } });
    if (post === null) throw postNotFound();
    return this.viewOf(this.dataSource.manager, post);
  }

  /** Soft delete/tombstone (spec §25) — owner only. Idempotent: deleting an already-tombstoned
   * post just returns it rather than erroring on a client's retried `DeletePost`. */
  async deletePost(actorId: string, postId: string): Promise<PostView> {
    const id = parseInput(uuidInputSchema, postId);

    return this.dataSource.transaction(async (manager) => {
      const posts = manager.getRepository(Post);
      const post = await posts.findOne({ where: { id }, relations: { authorActor: true } });
      if (post === null) throw postNotFound();
      if (post.authorActorId !== actorId) throw postForbidden();

      if (post.deletedAt === null) {
        await posts.update({ id, deletedAt: IsNull() }, { deletedAt: new Date() });
      }

      const tombstoned = await posts.findOneOrFail({
        where: { id },
        relations: { authorActor: true },
      });
      return this.viewOf(manager, tombstoned);
    });
  }

  /**
   * Direct replies to `postId` only — a full depth-bounded tree walk (the `max_depth` request
   * field) is deferred to Phase 4 (spec §24) along with `ListReplies`' broader UI. Deleted
   * replies are still returned, tombstoned, so a thread with a removed reply keeps its shape
   * (§25's "thread integrity" reason for soft-delete).
   */
  async listReplies(postId: string, cursorRaw: string, limit: number): Promise<ListRepliesResult> {
    const id = parseInput(uuidInputSchema, postId);
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(Post)
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.authorActor', 'author')
      .where('post.inReplyToId = :id', { id })
      .orderBy('post.createdAt', 'DESC')
      .addOrderBy('post.id', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(post.createdAt, post.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const posts = await Promise.all(page.map((row) => this.viewOf(this.dataSource.manager, row)));
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
    return { posts, nextCursor, hasMore };
  }

  // ---------------------------------------------------------------- internals

  private async viewOf(manager: EntityManager, post: Post): Promise<PostView> {
    const media = post.deletedAt !== null ? [] : await this.mediaFor(manager, post.id);
    const replyCount = await manager
      .getRepository(Post)
      .countBy({ inReplyToId: post.id, deletedAt: IsNull() });
    return toPostView(post, media, replyCount);
  }

  private async mediaFor(manager: EntityManager, postId: string): Promise<PostMediaSummary[]> {
    const rows = await manager.getRepository(PostMedia).find({
      where: { postId },
      relations: { media: true },
      order: { position: 'ASC' },
    });
    return rows.map((row) => ({
      mediaId: row.mediaId,
      altText: row.media.altText,
      width: row.media.width,
      height: row.media.height,
      mimeType: row.media.mimeType,
      position: row.position,
    }));
  }

  /** Validates `media_ids` against `media` (spec §27–28): owned by the author, `READY`, and
   * not deleted. Order is preserved — it becomes `post_media.position`. */
  private async attachableMedia(
    manager: EntityManager,
    ownerActorId: string,
    mediaIds: readonly string[],
  ): Promise<PostMediaSummary[]> {
    if (mediaIds.length === 0) return [];

    const rows = await manager.getRepository(Media).find({ where: { id: In([...mediaIds]) } });
    const byId = new Map(rows.map((row) => [row.id, row]));

    return mediaIds.map((mediaId, position) => {
      const media = byId.get(mediaId);
      if (media === undefined || media.ownerActorId !== ownerActorId || media.deletedAt !== null) {
        throw AppError.validation(`Media "${mediaId}" does not exist or does not belong to you.`);
      }
      if (media.state !== 'READY') {
        throw new AppError(
          'MEDIA_NOT_READY',
          `Media "${mediaId}" has not finished processing yet.`,
        );
      }
      return {
        mediaId: media.id,
        altText: media.altText,
        width: media.width,
        height: media.height,
        mimeType: media.mimeType,
        position,
      };
    });
  }
}

function postNotFound(): AppError {
  return new AppError('POST_NOT_FOUND', 'That post does not exist or was removed.');
}

function postForbidden(): AppError {
  return new AppError('POST_FORBIDDEN', 'You can only delete your own posts.');
}

/** PostgreSQL's `unique_violation` SQLSTATE, surfaced by `pg` as a plain `{ code: string }`. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
