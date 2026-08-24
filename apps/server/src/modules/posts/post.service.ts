import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Actor,
  Block,
  Bookmark,
  Community,
  CommunityMember,
  Follow,
  Like,
  Media,
  PinnedPost,
  Post,
  PostEdit,
  PostMedia,
  Repost,
  type PostVisibility as DbPostVisibility,
  type QuotePolicy as DbQuotePolicy,
} from '@patches/database';
import { MAX_PINNED_POSTS, MAX_POST_EDITS_PER_POST, RATE_LIMITS } from '@patches/domain';
import { DataSource, In, IsNull, type EntityManager, type SelectQueryBuilder } from 'typeorm';

import { enforceWindowRateLimit } from '../../common/rate-limit/window-rate-limiter.js';
import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { DbRateLimitStore } from '../auth/db-rate-limit-store.service.js';
import { FEDERATION_GATEWAY, type FederationGateway } from '../federation/federation-gateway.js';
import {
  applyCursor,
  applyHidePushdown,
  applyTagMuteFilter,
  applyVisibilityFilter,
  MAX_FILTER_ROUNDS,
} from '../feeds/feed.service.js';
import { clampLimit, decodeCursor, pageInfoFor, type Cursor } from '../feeds/pagination.js';
import { toPostViews } from '../feeds/post-batch.js';
import {
  buildFilterMatchCandidates,
  evaluateCandidate,
  loadEffectiveFilterRules,
  type FilterMatch,
  type FilterMatchCandidate,
} from '../filters/filter-matching.js';
import { type FilteredByHintView } from '../filters/filter.dto.js';
import { labelsForPosts } from '../labels/label-lookup.js';
import { NotificationsService } from '../notifications/notification.service.js';
import { applyIndexableFilter } from '../privacy/discoverability.js';
import { TagExtractionService, parseTags } from '../tags/tag-extraction.service.js';
import { communitySummaryOf } from './community-summary.js';
import { toPostView, type PostEditView, type PostMediaSummary, type PostView } from './post.dto.js';
import {
  createPostInputSchema,
  editPostInputSchema,
  parseInput,
  searchPostsInputSchema,
  uuidInputSchema,
} from './validation.js';

/**
 * The application service behind `patches.v1.PostService` (spec §23–26, §45, §51, §180,
 * §186, §188).
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
  /** Empty unless this post quotes another (spec §180.2). */
  quotedPostId?: string;
  /** Empty unless this post is being created into a community; immutable after insert
   * (spec §189) — there is no edit path for it. */
  communityId?: string;
  /** Defaults to `ANYONE` — see `post.mapper.ts#quotePolicyFromProto`. */
  quotePolicy: DbQuotePolicy;
}

export interface EditPostInput {
  body: string;
  contentWarning: string;
  mediaIds: string[];
}

export interface ListRepliesResult {
  posts: PostView[];
  nextCursor: string;
  hasMore: boolean;
}

export interface ListPostEditsResult {
  edits: PostEditView[];
  nextCursor: string;
  hasMore: boolean;
}

export interface SearchPostsResult {
  posts: PostView[];
  nextCursor: string;
  hasMore: boolean;
}

/** Local handle mention syntax (spec §22: lowercase ASCII, letters/digits/underscore, 3–30
 * chars) — `@handle`, matched case-insensitively and normalized before lookup. Does not match
 * a federated `@handle@node` form; cross-node mentions are a federation-era concern. */
const MENTION_PATTERN = /@([a-zA-Z0-9_]{3,30})\b/g;

/**
 * Extracts distinct, lowercased `@handle` mentions from a post body, stopping once `max`
 * distinct handles are found (S-002: `config.mentionFanoutMax`, `docs/operations/capacity.md`)
 * — a pathological wall of `@x`s must not fan out into hundreds of notification writes from a
 * single `CreatePost` call. A pure, exported function (not a `PostService` method) so the cap
 * itself is unit-testable without a database.
 */
export function extractMentionHandles(body: string, max: number): Set<string> {
  const handles = new Set<string>();
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const handle = match[1];
    if (handle === undefined) continue;
    handles.add(handle.toLowerCase());
    if (handles.size >= max) break;
  }
  return handles;
}

/** Server-side clamp for `ListRepliesRequest.max_depth` (spec §24 — "do not load an
 * arbitrarily large thread in one request"). */
const DEFAULT_REPLY_DEPTH = 4;
const MAX_REPLY_DEPTH = 6;

/** Hard cap on how many reply rows one `ListReplies` call ever loads before pagination, across
 * every depth level combined — the second half of the same §24 requirement, independent of
 * `max_depth` (a wide-but-shallow thread is bounded the same way a deep one is). */
const MAX_THREAD_NODES = 500;

const HOUR_MS = 60 * 60_000;

function clampDepth(requested: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_REPLY_DEPTH;
  return Math.min(Math.trunc(requested), MAX_REPLY_DEPTH);
}

@Injectable()
export class PostService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly config: AppConfigService,
    private readonly dbRateLimit: DbRateLimitStore,
    private readonly tagExtraction: TagExtractionService,
    @Inject(FEDERATION_GATEWAY) private readonly federation: FederationGateway,
  ) {}

  /**
   * Idempotent on `(author_actor_id, client_request_id)` (spec §45): a retried request with
   * the same key returns the original post rather than creating a second one, whether the
   * retry lands before or after the first attempt's row is visible.
   *
   * Replying to a blocked-either-direction actor's post is treated the same as replying to a
   * deleted/missing one (`POST_NOT_FOUND`, spec §62) — never `PERMISSION_DENIED`, which would
   * confirm the post's existence to a blocked caller. Quoting (spec §180.2) is checked the
   * same way for existence/blocks, but a denial from `quote_policy` itself is
   * `POST_FORBIDDEN` — quote policy is not a secret. Posting into a community (spec §189)
   * requires the author already be a member; `community_id` is immutable after insert (there
   * is no edit path for it, spec §186.1).
   */
  async createPost(input: CreatePostInput): Promise<PostView> {
    const parsed = parseInput(createPostInputSchema, input);
    parseTags(parsed.body ?? '');
    if (parsed.body !== undefined && parsed.body.length > this.config.maxPostChars) {
      throw new AppError(
        'POST_TOO_LONG',
        `Post body must be at most ${String(this.config.maxPostChars)} characters on this node.`,
      );
    }

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
          quotedPostAuthorId: null,
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

      if (parsed.communityId !== undefined) {
        const community = await manager
          .getRepository(Community)
          .findOne({ where: { id: parsed.communityId } });
        if (community === null) {
          throw AppError.validation('That community does not exist.');
        }
        const membership = await manager
          .getRepository(CommunityMember)
          .findOne({ where: { communityId: parsed.communityId, actorId: input.authorActorId } });
        if (membership === null) {
          throw AppError.validation('You must be a member of a community to post in it.');
        }
      }

      let quotedPostAuthorId: string | null = null;
      if (parsed.quotedPostId !== undefined) {
        const quoted = await posts.findOne({
          where: { id: parsed.quotedPostId },
          relations: { authorActor: true },
        });
        if (quoted === null || quoted.deletedAt !== null) throw postNotFound();
        if (await this.blockedEitherDirection(manager, input.authorActorId, quoted.authorActorId)) {
          throw postNotFound();
        }
        if (quoted.quotePolicy === 'NOBODY' && quoted.authorActorId !== input.authorActorId) {
          throw quoteDenied();
        }
        if (quoted.quotePolicy === 'FOLLOWERS' && quoted.authorActorId !== input.authorActorId) {
          const follow = await manager.getRepository(Follow).findOne({
            where: {
              followerActorId: input.authorActorId,
              followeeActorId: quoted.authorActorId,
              status: 'FOLLOWING',
            },
          });
          if (follow === null) throw quoteDenied();
        }
        await enforceWindowRateLimit(
          this.dbRateLimit,
          'quote',
          input.authorActorId,
          RATE_LIMITS.quotePerHour,
          HOUR_MS,
        );
        quotedPostAuthorId = quoted.authorActorId;
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
        quotedPostId: parsed.quotedPostId ?? null,
        communityId: parsed.communityId ?? null,
        quotePolicy: parsed.quotePolicy,
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
          quotedPostAuthorId: null,
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

      await this.tagExtraction.extractAndAttach(manager, id, parsed.body ?? '');

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
          { replyCount: 0, likeCount: 0, repostCount: 0, quoteCount: 0 },
          { liked: false, bookmarked: false, reposted: false },
        ),
        replyRecipientActorId,
        mentionActorIds,
        quotedPostAuthorId,
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
    if (result.quotedPostAuthorId !== null && result.quotedPostAuthorId !== input.authorActorId) {
      await this.notifications.notifyQuote(
        result.quotedPostAuthorId,
        input.authorActorId,
        result.view.id,
      );
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
   * post just returns it rather than erroring on a client's retried `DeletePost`. Tombstones
   * every repost of it (spec §180.1 — a repost is a pointer, so this needs no extra write:
   * rendering a repost always resolves through the underlying, now-tombstoned post) and its
   * edit history (spec §186.1 — `ListPostEdits` stops serving rows once `deletedAt` is set,
   * see that method). */
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
   * In-place edit (spec §186.1, §189): may change `body`/`content_warning`/media set/order.
   * Cannot change `post_type`/`visibility`/`in_reply_to_id`/`community_id`/`quoted_post_id`/
   * `created_at` — `EditPostRequest` simply carries no such fields, so those are immutable by
   * construction, not by an extra check here. Every call snapshots the post's *previous*
   * state into `post_edits` before applying the new one (up to `MAX_POST_EDITS_PER_POST`,
   * spec §188), sets `edited_at`, and never touches `created_at` — an edit's feed position is
   * therefore always its original `created_at` (explicit test in the integration suite).
   */
  async editPost(actorId: string, postIdRaw: string, input: EditPostInput): Promise<PostView> {
    const postId = parseInput(uuidInputSchema, postIdRaw);
    const parsed = parseInput(editPostInputSchema, input);
    parseTags(parsed.body);
    if (parsed.body.length > this.config.maxPostChars) {
      throw new AppError(
        'POST_TOO_LONG',
        `Post body must be at most ${String(this.config.maxPostChars)} characters on this node.`,
      );
    }

    await enforceWindowRateLimit(
      this.dbRateLimit,
      'post_edit',
      actorId,
      RATE_LIMITS.postEditPerHour,
      HOUR_MS,
    );

    return this.dataSource.transaction(async (manager) => {
      const posts = manager.getRepository(Post);
      const post = await posts.findOne({ where: { id: postId }, relations: { authorActor: true } });
      if (post === null) throw postNotFound();
      if (post.authorActorId !== actorId) throw postForbidden();
      if (post.deletedAt !== null) throw postNotFound();

      if (parsed.body.length === 0 && parsed.mediaIds.length === 0 && post.postType !== 'LINK') {
        throw AppError.validation('a post needs text or at least one image (spec §23).');
      }

      const editCount = await manager.getRepository(PostEdit).countBy({ postId });
      if (editCount >= MAX_POST_EDITS_PER_POST) {
        throw AppError.validation(
          `this post has reached its ${String(MAX_POST_EDITS_PER_POST)}-edit history limit (spec §188).`,
        );
      }

      const previousMedia = await this.mediaFor(manager, postId);
      const postEdits = manager.getRepository(PostEdit);
      await postEdits.save(
        postEdits.create({
          postId,
          previousBody: post.body,
          previousContentWarning: post.contentWarning,
          previousMediaManifest: previousMedia.length > 0 ? previousMedia : null,
          editedByActorId: actorId,
        }),
      );

      const media = await this.attachableMedia(manager, actorId, parsed.mediaIds);
      await manager.getRepository(PostMedia).delete({ postId });
      if (media.length > 0) {
        const postMediaRepo = manager.getRepository(PostMedia);
        await postMediaRepo.save(
          media.map((row, position) =>
            postMediaRepo.create({ postId, mediaId: row.mediaId, position }),
          ),
        );
      }

      await posts.update(
        { id: postId },
        {
          body: parsed.body.length === 0 ? null : parsed.body,
          contentWarning: parsed.contentWarning.length === 0 ? null : parsed.contentWarning,
          editedAt: new Date(),
        },
      );

      await this.tagExtraction.extractAndAttach(manager, postId, parsed.body);

      const updated = await posts.findOneOrFail({
        where: { id: postId },
        relations: { authorActor: true },
      });
      return this.viewOf(manager, updated, actorId);
    });
  }

  /**
   * The edit history of a post, most-recent first (spec §186.1). Readable by anyone who can
   * read the post (same `getPost` block/existence check), but returns nothing once the post
   * itself is tombstoned — "deleting the post tombstones its edit history with it" (spec
   * §186.1). The `post_edits` rows themselves are never deleted (nothing here issues a
   * `DELETE`); they are simply never served again once `post.deletedAt` is set, the same
   * "hidden, not erased" treatment `toPostView` already gives a tombstoned post's `body`.
   */
  async listPostEdits(
    postIdRaw: string,
    cursorRaw: string,
    limit: number,
    viewerActorId?: string,
  ): Promise<ListPostEditsResult> {
    const postId = parseInput(uuidInputSchema, postIdRaw);
    const post = await this.getPost(postId, viewerActorId);
    if (post.deleted) {
      return { edits: [], nextCursor: '', hasMore: false };
    }

    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(PostEdit)
      .createQueryBuilder('edit')
      .where('edit.postId = :postId', { postId })
      .orderBy('edit.createdAt', 'DESC')
      .addOrderBy('edit.id', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(edit.createdAt, edit.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const edits = page.map(toPostEditView);
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
    return { edits, nextCursor, hasMore };
  }

  /**
   * Pins one of the caller's own posts to their profile (spec §184.1, §188): up to
   * `MAX_PINNED_POSTS`, own `PUBLIC`/`UNLISTED` posts only (a `FOLLOWERS` post pinned to a
   * public profile would leak past its intended audience). Pinning a post already pinned just
   * moves it to the requested `position`; pinning a *different* post into an occupied
   * position vacates the one that was there. Pinning never affects any feed's ordering (spec
   * §184.1) — this only ever touches `pinned_posts`.
   */
  async pinPost(actorId: string, postIdRaw: string, position: number): Promise<PostView> {
    const postId = parseInput(uuidInputSchema, postIdRaw);
    if (!Number.isInteger(position) || position < 0 || position >= MAX_PINNED_POSTS) {
      throw AppError.validation(`position must be between 0 and ${String(MAX_PINNED_POSTS - 1)}.`);
    }

    return this.dataSource.transaction(async (manager) => {
      const posts = manager.getRepository(Post);
      const post = await posts.findOne({ where: { id: postId }, relations: { authorActor: true } });
      if (post === null || post.deletedAt !== null) throw postNotFound();
      if (post.authorActorId !== actorId) throw postForbidden();
      if (post.visibility !== 'PUBLIC' && post.visibility !== 'UNLISTED') {
        throw AppError.validation('only PUBLIC or UNLISTED posts can be pinned (spec §184.1).');
      }

      const pins = manager.getRepository(PinnedPost);
      const existing = await pins.find({ where: { actorId } });
      const alreadyPinned = existing.find((row) => row.postId === postId);
      if (alreadyPinned === undefined && existing.length >= MAX_PINNED_POSTS) {
        throw AppError.validation(`you can only pin up to ${String(MAX_PINNED_POSTS)} posts.`);
      }

      const occupying = existing.find((row) => row.position === position && row.postId !== postId);
      if (occupying !== undefined) {
        await pins.delete({ actorId, postId: occupying.postId });
      }
      if (alreadyPinned !== undefined) {
        await pins.update({ actorId, postId }, { position });
      } else {
        await pins.save(pins.create({ actorId, postId, position }));
      }

      return this.viewOf(manager, post, actorId);
    });
  }

  /** Idempotent: unpinning a post that isn't pinned is not an error (spec §189). */
  async unpinPost(actorId: string, postIdRaw: string): Promise<PostView> {
    const postId = parseInput(uuidInputSchema, postIdRaw);
    const post = await this.dataSource
      .getRepository(Post)
      .findOne({ where: { id: postId }, relations: { authorActor: true } });
    if (post === null) throw postNotFound();

    await this.dataSource.getRepository(PinnedPost).delete({ actorId, postId });
    return this.viewOf(this.dataSource.manager, post, actorId);
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

  /**
   * Full-text search over local post bodies (spec §194): Postgres `websearch_to_tsquery`
   * against the `tsv` generated column with `idx_posts_tsv` GIN index,
   * strictly newest-first and keyset-paged like every other list RPC — never a relevance
   * score, never a `sort`/`order` parameter.
   *
   * Reuses `FeedService`'s exported `applyVisibilityFilter`/`applyTagMuteFilter`/`applyCursor`
   * so the exact same block/mute/`FOLLOWERS`-visibility/tag-mute rules `ListLocalFeed` applies
   * govern search too (spec §62), and mirrors `listLocalFeed`'s `isLocal`/community-visibility
   * shape rather than duplicating it.
   */
  async searchPosts(
    queryRaw: string,
    cursorRaw: string,
    limit: number,
    authorHandleRaw: string | undefined,
    includeReplies: boolean,
    viewerActorId?: string,
  ): Promise<SearchPostsResult> {
    const parsed = parseInput(searchPostsInputSchema, {
      query: queryRaw,
      authorHandle: authorHandleRaw,
    });

    let authorActorId: string | undefined;
    if (parsed.authorHandle !== undefined) {
      const author = await this.dataSource
        .getRepository(Actor)
        .findOne({ where: { handleNormalized: parsed.authorHandle.toLowerCase() } });
      // An unknown handle is an empty result set, not an error — the same "degrade to no
      // matches" treatment `listTagFeed` gives an unknown tag.
      if (author === null) return { posts: [], nextCursor: '', hasMore: false };
      authorActorId = author.id;
    }

    let cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    // Named (`:searchQuery`) rather than a positional `$1`: TypeORM binds only named
    // parameters — a raw `$1` is never wired to the value and either errors ("there is no
    // parameter $1") or silently binds to whichever parameter TypeORM numbered first.
    const tsQuery = `websearch_to_tsquery('english', :searchQuery)`;

    const qb = this.dataSource
      .getRepository(Post)
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.authorActor', 'author')
      .andWhere(`post.tsv @@ ${tsQuery}`, { searchQuery: parsed.query })
      .andWhere('post.isLocal = true')
      .orderBy('post.createdAt', 'DESC')
      .addOrderBy('post.id', 'DESC');

    applyVisibilityFilter(qb, viewerActorId, 'post');
    if (viewerActorId !== undefined) applyTagMuteFilter(qb, viewerActorId, 'post');
    // §197.5: `indexable = false` excludes an actor's posts from full-text search specifically —
    // the post remains visible everywhere else (profile, feeds, direct link).
    applyIndexableFilter(qb, '"post"."author_actor_id"');

    if (authorActorId !== undefined) {
      qb.andWhere('post.authorActorId = :searchAuthorActorId', {
        searchAuthorActorId: authorActorId,
      });
    }
    if (!includeReplies) {
      qb.andWhere('post.inReplyToId IS NULL');
    }
    if (viewerActorId === undefined) {
      qb.andWhere('post.communityId IS NULL');
    } else {
      qb.andWhere(
        `(post.communityId IS NULL OR EXISTS (
          SELECT 1 FROM community_members search_member
          WHERE search_member.community_id = "post"."community_id"
            AND search_member.actor_id = :searchViewerActorId
        ))`,
        { searchViewerActorId: viewerActorId },
      );
    }
    const rules =
      viewerActorId === undefined
        ? []
        : await loadEffectiveFilterRules(this.dataSource, viewerActorId, 'SEARCH');
    // P14-021: push `hide`-action ACTOR/TAG rules into the query before the round loop clones
    // it — same treatment `FeedService#page()` gives its own query.
    applyHidePushdown(qb, rules, '"post"."author_actor_id"', '"post"."id"');

    // Same bounded over-fetch/re-fetch pattern as `FeedService#page()` (spec §198.3, §198.4):
    // a `hide` match must not leave the page short, but re-fetching is capped at
    // `MAX_FILTER_ROUNDS` rounds rather than looped unboundedly.
    const collected: Array<{ post: Post; hint: FilteredByHintView | null }> = [];
    let roundHasMore = false;
    for (let round = 0; round < MAX_FILTER_ROUNDS && collected.length < take; round += 1) {
      const remaining = take - collected.length;
      const roundQb = qb.clone();
      if (cursor !== undefined) applyCursor(roundQb, 'post', cursor);
      roundQb.take(remaining + 1);

      const rows = await roundQb.getMany();
      roundHasMore = rows.length > remaining;
      const roundRows = roundHasMore ? rows.slice(0, remaining) : rows;
      if (roundRows.length === 0) break;

      const candidates: Map<string, FilterMatchCandidate> =
        rules.length === 0
          ? new Map<string, FilterMatchCandidate>()
          : await buildFilterMatchCandidates(this.dataSource, roundRows);
      for (const row of roundRows) {
        const candidate = candidates.get(row.id);
        const match = candidate === undefined ? null : evaluateCandidate(rules, candidate);
        if (match?.action === 'HIDE') continue;
        collected.push({
          post: row,
          hint: match === null ? null : toSearchFilteredByHintView(match),
        });
      }

      const last = roundRows.at(-1);
      if (last !== undefined) cursor = { createdAt: last.createdAt, id: last.id };
      if (!roundHasMore) break;
    }

    const page = collected.slice(0, take);
    const views = await toPostViews(
      this.dataSource.manager,
      page.map((row) => row.post),
      viewerActorId,
    );
    const posts = views.map((view, index) => ({ ...view, filteredBy: page[index]?.hint ?? null }));
    const { nextCursor } = pageInfoFor(page, roundHasMore, (row) => ({
      createdAt: row.post.createdAt,
      id: row.post.id,
    }));
    return { posts, nextCursor, hasMore: roundHasMore };
  }

  // ---------------------------------------------------------------- internals

  private async viewOf(
    manager: EntityManager,
    post: Post,
    viewerActorId?: string,
  ): Promise<PostView> {
    const media = post.deletedAt !== null ? [] : await this.mediaFor(manager, post.id);
    const { counts, viewerState } = await this.countsAndViewerState(
      manager,
      post.id,
      viewerActorId,
    );
    const quotedPost =
      post.deletedAt !== null || post.quotedPostId === null
        ? null
        : await this.quotedPostViewOf(manager, post.quotedPostId, viewerActorId);
    const community =
      post.deletedAt !== null || post.communityId === null
        ? null
        : await communitySummaryOf(manager, post.communityId);
    // `Post.labels` (spec §200.3, §203) — same subscriber-scoped lookup feeds already apply
    // via `feeds/post-batch.ts`; single-post reads (`getPost`/`listReplies`/edit/pin/etc, all
    // of which funnel through this method) previously left `labels` defaulted to `[]`.
    const labelsByPost = await labelsForPosts(manager, [post.id], viewerActorId);
    return toPostView(post, media, counts, viewerState, {
      quotedPost,
      community,
      labels: labelsByPost.get(post.id) ?? [],
    });
  }

  /** One level of quote nesting only (spec §180.2, §188) — the returned `PostView`'s own
   * `quotedPost` is always `null` by construction (`toPostView`'s `extras` here never passes
   * one through), regardless of whether the quoted post itself quotes another. */
  private async quotedPostViewOf(
    manager: EntityManager,
    quotedPostId: string,
    viewerActorId?: string,
  ): Promise<PostView | null> {
    const quoted = await manager
      .getRepository(Post)
      .findOne({ where: { id: quotedPostId }, relations: { authorActor: true } });
    if (quoted === null) return null;

    const media = quoted.deletedAt !== null ? [] : await this.mediaFor(manager, quoted.id);
    const { counts, viewerState } = await this.countsAndViewerState(
      manager,
      quoted.id,
      viewerActorId,
    );
    const community =
      quoted.deletedAt !== null || quoted.communityId === null
        ? null
        : await communitySummaryOf(manager, quoted.communityId);
    const labelsByPost = await labelsForPosts(manager, [quoted.id], viewerActorId);
    return toPostView(quoted, media, counts, viewerState, {
      quotedPost: null,
      community,
      labels: labelsByPost.get(quoted.id) ?? [],
    });
  }

  private async countsAndViewerState(
    manager: EntityManager,
    postId: string,
    viewerActorId?: string,
  ): Promise<{
    counts: { replyCount: number; likeCount: number; repostCount: number; quoteCount: number };
    viewerState: { liked: boolean; bookmarked: boolean; reposted: boolean };
  }> {
    const [replyCount, likeCount, repostCount, quoteCount, likedRow, bookmarkedRow, repostedRow] =
      await Promise.all([
        manager.getRepository(Post).countBy({ inReplyToId: postId, deletedAt: IsNull() }),
        manager.getRepository(Like).countBy({ postId }),
        manager.getRepository(Repost).countBy({ postId }),
        manager.getRepository(Post).countBy({ quotedPostId: postId, deletedAt: IsNull() }),
        viewerActorId === undefined
          ? Promise.resolve(null)
          : manager.getRepository(Like).findOne({ where: { postId, actorId: viewerActorId } }),
        viewerActorId === undefined
          ? Promise.resolve(null)
          : manager.getRepository(Bookmark).findOne({ where: { postId, actorId: viewerActorId } }),
        viewerActorId === undefined
          ? Promise.resolve(null)
          : manager.getRepository(Repost).findOne({ where: { postId, actorId: viewerActorId } }),
      ]);
    return {
      counts: { replyCount, likeCount, repostCount, quoteCount },
      viewerState: {
        liked: likedRow !== null,
        bookmarked: bookmarkedRow !== null,
        reposted: repostedRow !== null,
      },
    };
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
   * `config.mentionFanoutMax` (S-002: a pathological wall of `@x`s must not fan out into
   * hundreds of notification writes from a single `CreatePost` call — `docs/operations/
   * capacity.md`). */
  private async resolveMentions(
    manager: EntityManager,
    body: string,
    authorActorId: string,
  ): Promise<string[]> {
    const handles = extractMentionHandles(body, this.config.mentionFanoutMax);
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

/** `quote_policy` denial (spec §180.2, §192) — a known concept, not a secret like block-hiding
 * is, so this is `POST_FORBIDDEN` (→ `PERMISSION_DENIED`) rather than `POST_NOT_FOUND`. */
function quoteDenied(): AppError {
  return new AppError('POST_FORBIDDEN', "This post's quote policy does not permit quoting it.");
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

/** Best-effort read of a `post_edits.previous_media_manifest` `jsonb` array back into
 * `PostMediaSummary[]` — never throws for an unexpected shape, same "degrade a field, don't
 * 500" reasoning as `actor.dto.ts#toNameplateSummary`. */
function toPostMediaSummaryLenient(raw: unknown): PostMediaSummary {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const string = (value: unknown): string | null => (typeof value === 'string' ? value : null);
  const number = (value: unknown): number | null => (typeof value === 'number' ? value : null);
  return {
    mediaId: typeof record.mediaId === 'string' ? record.mediaId : '',
    altText: string(record.altText),
    width: number(record.width),
    height: number(record.height),
    mimeType: string(record.mimeType),
    position: typeof record.position === 'number' ? record.position : 0,
  };
}

function toPostEditView(row: PostEdit): PostEditView {
  return {
    id: row.id,
    postId: row.postId,
    previousBody: row.previousBody,
    previousContentWarning: row.previousContentWarning,
    previousMedia: Array.isArray(row.previousMediaManifest)
      ? row.previousMediaManifest.map(toPostMediaSummaryLenient)
      : [],
    editedByActorId: row.editedByActorId,
    createdAt: row.createdAt,
  };
}

/** Mirrors `feed.service.ts`'s private `toFilteredByHintView` — kept as a separate copy
 * (rather than exported/shared) because `FilterMatch`/`FilteredByHintView` are tiny value
 * shapes and `searchPosts` is the only caller outside `feeds/`. */
function toSearchFilteredByHintView(match: FilterMatch): FilteredByHintView {
  return {
    provenance: match.provenance,
    name: match.name,
    listOwner: match.listOwner,
    action: match.action,
  };
}
