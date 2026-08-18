import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Actor,
  Block,
  Bookmark,
  Like,
  Media,
  Post,
  PostMedia,
  type PostVisibility as DbPostVisibility,
} from '@patches/database';
import { DataSource, In, IsNull, type EntityManager, type SelectQueryBuilder } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { FEDERATION_GATEWAY, type FederationGateway } from '../federation/federation-gateway.js';
import { clampLimit, decodeCursor, pageInfoFor, type Cursor } from '../feeds/pagination.js';
import { NotificationsService } from '../notifications/notification.service.js';
import { toPostView, type PostMediaSummary, type PostView } from './post.dto.js';
import { createPostInputSchema, parseInput, uuidInputSchema } from './validation.js';

/**
 * The application service behind `patches.v1.PostService` (spec §23–26, §45, §51).
 *
 * Idempotency, tombstoning, and the "text/link/image" constraint (§23) all live here, not in
 * the controller or the database — the unique index and the `link_url` CHECK are backstops,
 * not the primary enforcement (spec §103).
 *
 * Block enforcement (spec §62 — "B should not see A through authenticated normal API
 * surfaces", "B should not interact with A's posts") lives here too: `getPost`/`listReplies`
 * take an optional `viewerActorId` and return `POST_NOT_FOUND` uniformly rather than a
 * `PERMISSION_DENIED` that would leak the post's existence to a blocked caller.
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

/** Local handle mention syntax (spec §22: lowercase ASCII, letters/digits/underscore, 3–30
 * chars) — `@handle`, matched case-insensitively and normalized before lookup. Does not match
 * a federated `@handle@node` form; cross-node mentions are a federation-era concern. */
const MENTION_PATTERN = /@([a-zA-Z0-9_]{3,30})\b/g;

/** Bounds how many distinct actors one post can mention-notify — a pathological wall of `@x`s
 * must not fan out into hundreds of notification writes from a single `CreatePost` call. */
const MAX_MENTIONS_PER_POST = 50;

/** Server-side clamp for `ListRepliesRequest.max_depth` (spec §24 — "do not load an
 * arbitrarily large thread in one request"). */
const DEFAULT_REPLY_DEPTH = 4;
const MAX_REPLY_DEPTH = 6;

/** Hard cap on how many reply rows one `ListReplies` call ever loads before pagination, across
 * every depth level combined — the second half of the same §24 requirement, independent of
 * `max_depth` (a wide-but-shallow thread is bounded the same way a deep one is). */
const MAX_THREAD_NODES = 500;

function clampDepth(requested: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_REPLY_DEPTH;
  return Math.min(Math.trunc(requested), MAX_REPLY_DEPTH);
}

@Injectable()
export class PostService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    @Inject(FEDERATION_GATEWAY) private readonly federation: FederationGateway,
  ) {}

  /**
   * Idempotent on `(author_actor_id, client_request_id)` (spec §45): a retried request with
   * the same key returns the original post rather than creating a second one, whether the
   * retry lands before or after the first attempt's row is visible.
   *
   * Replying to a blocked-either-direction actor's post is treated the same as replying to a
   * deleted/missing one (`POST_NOT_FOUND`, spec §62) — never `PERMISSION_DENIED`, which would
   * confirm the post's existence to a blocked caller.
   */
  async createPost(input: CreatePostInput): Promise<PostView> {
    const parsed = parseInput(createPostInputSchema, input);

    const result = await this.dataSource.transaction(async (manager) => {
      const posts = manager.getRepository(Post);

      const existing = await posts.findOne({
        where: { authorActorId: input.authorActorId, clientRequestId: parsed.clientRequestId },
        relations: { authorActor: true },
      });
      if (existing !== null) {
        return {
          view: await this.viewOf(manager, existing, input.authorActorId),
          replyRecipientActorId: null,
          mentionActorIds: [] as string[],
        };
      }

      const id: string = randomUUID();
      let rootPostId: string = id;
      let replyRecipientActorId: string | null = null;
      if (parsed.inReplyToId !== undefined) {
        const parent = await posts.findOne({ where: { id: parsed.inReplyToId } });
        if (parent === null || parent.deletedAt !== null) throw postNotFound();
        if (await this.blockedEitherDirection(manager, input.authorActorId, parent.authorActorId)) {
          throw postNotFound();
        }
        rootPostId = parent.rootPostId;
        replyRecipientActorId = parent.authorActorId;
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
        return {
          view: await this.viewOf(manager, winner, input.authorActorId),
          replyRecipientActorId: null,
          mentionActorIds: [] as string[],
        };
      }

      if (media.length > 0) {
        const postMedia = manager.getRepository(PostMedia);
        await postMedia.save(
          media.map((row, position) =>
            postMedia.create({ postId: id, mediaId: row.mediaId, position }),
          ),
        );
      }

      // P8-002/P8-003: delivers `Create(Note)` to the author's remote followers, enqueued in
      // this same transaction (`FederationGateway`'s doc comment). No-op (`NoopFederationGateway`
      // or `publishPost`'s own visibility check) unless federation is enabled and the post is
      // `PUBLIC`.
      await this.federation.publishPost(manager, id);

      const mentionActorIds =
        parsed.body === undefined
          ? []
          : await this.resolveMentions(manager, parsed.body, input.authorActorId);

      const withAuthor = await posts.findOneOrFail({
        where: { id: saved.id },
        relations: { authorActor: true },
      });
      return {
        view: toPostView(
          withAuthor,
          media,
          { replyCount: 0, likeCount: 0 },
          { liked: false, bookmarked: false },
        ),
        replyRecipientActorId,
        mentionActorIds,
      };
    });

    // Notifications are deliberately outside the transaction above: they are a side effect of
    // a successfully created post, not part of what makes the post creation atomic. A retry
    // after a notification failure lands on the idempotent "existing post" branch above, which
    // does not re-attempt the notification — an accepted v0 gap (documented in this task's
    // report) rather than entangling `PostService`'s transaction with `NotificationsService`'s.
    if (result.replyRecipientActorId !== null) {
      await this.notifications.notifyReply(
        result.replyRecipientActorId,
        input.authorActorId,
        result.view.id,
      );
    }
    for (const mentionedActorId of result.mentionActorIds) {
      await this.notifications.notifyMention(mentionedActorId, input.authorActorId, result.view.id);
    }

    return result.view;
  }

  /**
   * Never throws `POST_NOT_FOUND` for a tombstoned post (spec §25) — only for one that never
   * existed, or one whose author is blocked either-direction from `viewerActorId` (spec §62).
   * The caller (`PostController`) renders `[deleted]` off `Post.deleted`.
   */
  async getPost(id: string, viewerActorId?: string): Promise<PostView> {
    const parsed = parseInput(uuidInputSchema, id);
    const post = await this.dataSource
      .getRepository(Post)
      .findOne({ where: { id: parsed }, relations: { authorActor: true } });
    if (post === null) throw postNotFound();
    if (
      viewerActorId !== undefined &&
      (await this.blockedEitherDirection(
        this.dataSource.manager,
        viewerActorId,
        post.authorActorId,
      ))
    ) {
      throw postNotFound();
    }
    return this.viewOf(this.dataSource.manager, post, viewerActorId);
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
        // P8-002/P8-003: only on the transition into tombstoned — a retried `DeletePost` on
        // an already-deleted post must not re-deliver `Delete`.
        await this.federation.publishDelete(manager, id);
      }

      const tombstoned = await posts.findOneOrFail({
        where: { id },
        relations: { authorActor: true },
      });
      return this.viewOf(manager, tombstoned, actorId);
    });
  }

  /**
   * Bounded-depth, paginated thread read (spec §24). Walks the reply tree breadth-first up to
   * `max_depth` levels (clamped 1–6, default 4), capping the total number of rows collected
   * across every level at {@link MAX_THREAD_NODES} — the two bounds together are what keep a
   * single call from loading an arbitrarily large thread. The collected set is then sorted to
   * the canonical `(created_at DESC, id DESC)` ordering and keyset-paginated in memory.
   *
   * This trades true database-side pagination of a single flat query for a much simpler
   * implementation than a recursive CTE, which is an acceptable v0 tradeoff exactly because
   * both bounds above already cap the work per call — see this task's report for the
   * alternative considered.
   *
   * Deleted replies are still returned, tombstoned, so a thread with a removed reply keeps its
   * shape (§25's "thread integrity" reason for soft-delete). Replies by an actor blocked
   * either-direction from `viewerActorId` are excluded (spec §62).
   */
  async listReplies(
    postId: string,
    cursorRaw: string,
    limit: number,
    maxDepthRaw: number,
    viewerActorId?: string,
  ): Promise<ListRepliesResult> {
    const id = parseInput(uuidInputSchema, postId);
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);
    const maxDepth = clampDepth(maxDepthRaw);

    const collected: Post[] = [];
    let frontier = [id];
    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      if (collected.length >= MAX_THREAD_NODES) break;

      const qb = this.dataSource
        .getRepository(Post)
        .createQueryBuilder('post')
        .leftJoinAndSelect('post.authorActor', 'author')
        .where('post.inReplyToId IN (:...frontier)', { frontier })
        .orderBy('post.createdAt', 'ASC')
        .take(MAX_THREAD_NODES - collected.length);
      if (viewerActorId !== undefined) applyBlockFilter(qb, viewerActorId);

      const children = await qb.getMany();
      collected.push(...children);
      frontier = children.map((child) => child.id);
    }

    collected.sort((a, b) => {
      const byDate = b.createdAt.getTime() - a.createdAt.getTime();
      return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
    });

    const eligible =
      cursor === undefined ? collected : collected.filter((row) => isOlderThanCursor(row, cursor));
    const hasMore = eligible.length > take;
    const page = eligible.slice(0, take);

    const posts = await Promise.all(
      page.map((row) => this.viewOf(this.dataSource.manager, row, viewerActorId)),
    );
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
    return { posts, nextCursor, hasMore };
  }

  // ---------------------------------------------------------------- internals

  private async viewOf(
    manager: EntityManager,
    post: Post,
    viewerActorId?: string,
  ): Promise<PostView> {
    const media = post.deletedAt !== null ? [] : await this.mediaFor(manager, post.id);
    const [replyCount, likeCount, likedRow, bookmarkedRow] = await Promise.all([
      manager.getRepository(Post).countBy({ inReplyToId: post.id, deletedAt: IsNull() }),
      manager.getRepository(Like).countBy({ postId: post.id }),
      viewerActorId === undefined
        ? Promise.resolve(null)
        : manager
            .getRepository(Like)
            .findOne({ where: { postId: post.id, actorId: viewerActorId } }),
      viewerActorId === undefined
        ? Promise.resolve(null)
        : manager
            .getRepository(Bookmark)
            .findOne({ where: { postId: post.id, actorId: viewerActorId } }),
    ]);
    return toPostView(
      post,
      media,
      { replyCount, likeCount },
      { liked: likedRow !== null, bookmarked: bookmarkedRow !== null },
    );
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

  /** Parses `@handle` mentions (spec §22 handle syntax) out of a post body and resolves them
   * to local actor ids, excluding the author (never self-mention-notify) and capped at
   * {@link MAX_MENTIONS_PER_POST}. */
  private async resolveMentions(
    manager: EntityManager,
    body: string,
    authorActorId: string,
  ): Promise<string[]> {
    const handles = new Set<string>();
    for (const match of body.matchAll(MENTION_PATTERN)) {
      const handle = match[1];
      if (handle === undefined) continue;
      handles.add(handle.toLowerCase());
      if (handles.size >= MAX_MENTIONS_PER_POST) break;
    }
    if (handles.size === 0) return [];

    const actors = await manager
      .getRepository(Actor)
      .find({ where: { handleNormalized: In([...handles]) } });
    return actors
      .filter((actor) => actor.id !== authorActorId && actor.deletedAt === null)
      .map((actor) => actor.id);
  }

  private async blockedEitherDirection(
    manager: EntityManager,
    actorAId: string,
    actorBId: string,
  ): Promise<boolean> {
    const blocks = manager.getRepository(Block);
    const [aBlocksB, bBlocksA] = await Promise.all([
      blocks.findOne({ where: { blockerActorId: actorAId, blockedActorId: actorBId } }),
      blocks.findOne({ where: { blockerActorId: actorBId, blockedActorId: actorAId } }),
    ]);
    return aBlocksB !== null || bBlocksA !== null;
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

/** `true` when `row` sorts strictly after `cursor` in the canonical `(created_at DESC, id
 * DESC)` ordering — i.e. it belongs on the page *after* the cursor. */
function isOlderThanCursor(row: Post, cursor: Cursor): boolean {
  const rowTime = row.createdAt.getTime();
  const cursorTime = cursor.createdAt.getTime();
  if (rowTime !== cursorTime) return rowTime < cursorTime;
  return row.id < cursor.id;
}

/** Excludes replies by an actor blocked either-direction from `viewerActorId` (spec §62) — same
 * fully-qualified, quoted column reference pattern as `FeedService.applyVisibilityFilter`
 * (`"post"."author_actor_id"`, not `post.authorActorId`), for the same reason documented
 * there. */
function applyBlockFilter(qb: SelectQueryBuilder<Post>, viewerActorId: string): void {
  qb.andWhere(
    `NOT EXISTS (
      SELECT 1 FROM blocks reply_block
      WHERE (reply_block.blocker_actor_id = :viewerActorId
             AND reply_block.blocked_actor_id = "post"."author_actor_id")
         OR (reply_block.blocker_actor_id = "post"."author_actor_id"
             AND reply_block.blocked_actor_id = :viewerActorId)
    )`,
    { viewerActorId },
  );
}
