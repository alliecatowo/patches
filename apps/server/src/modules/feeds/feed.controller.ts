import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type FeedServiceController,
  FeedServiceControllerMethods,
  type ListActorPostsRequest,
  type ListActorPostsResponse,
  type ListCommunityFeedRequest,
  type ListCommunityFeedResponse,
  type ListHomeFeedRequest,
  type ListHomeFeedResponse,
  type ListLocalFeedRequest,
  type ListLocalFeedResponse,
  type ListTagFeedRequest,
  type ListTagFeedResponse,
  type Post as ProtoPost,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims, TokenService } from '../auth/token.service.js';
import { toProtoPost } from '../posts/post.mapper.js';
import { FeedService, type FeedPage } from './feed.service.js';

const AUTHORIZATION_METADATA_KEY = 'authorization';
const BEARER_PREFIX = 'bearer ';

/**
 * Transport adapter for `patches.v1.FeedService` — protobuf in, protobuf out, no business
 * logic (spec §128).
 *
 * `ListHomeFeed` requires an authenticated session (`AuthGuard`) — a feed keyed on "who you
 * follow" has no meaning for an anonymous caller. `ListLocalFeed`/`ListActorPosts` stay
 * anonymous-readable but honor a *present* session too: an authenticated caller browsing the
 * local feed or another actor's posts should still get block/mute/`FOLLOWERS`-visibility
 * filtering (spec §62 — "B should not see A through authenticated normal API surfaces"), so
 * this reads the bearer token when one is sent instead of requiring `AuthGuard` for it.
 */
@Controller()
@FeedServiceControllerMethods()
export class FeedController implements FeedServiceController {
  constructor(
    private readonly feeds: FeedService,
    private readonly tokens: TokenService,
  ) {}

  @UseGuards(AuthGuard)
  async listHomeFeed(
    @Payload() request: ListHomeFeedRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListHomeFeedResponse> {
    return toResponse(
      await this.feeds.listHomeFeed(requireSession(session).actorId, request.cursor, request.limit),
    );
  }

  async listLocalFeed(
    @Payload() request: ListLocalFeedRequest,
    @Ctx() metadata?: Metadata,
  ): Promise<ListLocalFeedResponse> {
    const viewerActorId = await this.optionalViewerActorId(metadata);
    return toResponse(await this.feeds.listLocalFeed(request.cursor, request.limit, viewerActorId));
  }

  async listActorPosts(
    @Payload() request: ListActorPostsRequest,
    @Ctx() metadata?: Metadata,
  ): Promise<ListActorPostsResponse> {
    const viewerActorId = await this.optionalViewerActorId(metadata);
    return toResponse(
      await this.feeds.listActorPosts(
        request.actorId,
        request.cursor,
        request.limit,
        viewerActorId,
      ),
    );
  }

  /**
   * `FeedService` has no tag/community feed application logic yet — `ListTagFeed`'s
   * `post_tags`/`tags` join and `ListCommunityFeed`'s `posts.community_id` filter land with
   * the tags/communities slice of Amendment B (P11-00x); this contract-only wave (P11-001)
   * only needs the controller to satisfy `FeedServiceController`. Honest `NOT_IMPLEMENTED`
   * (spec §176) rather than a silent empty page.
   */
  listTagFeed(@Payload() _request: ListTagFeedRequest): Promise<ListTagFeedResponse> {
    throw new AppError('NOT_IMPLEMENTED', 'ListTagFeed is not implemented yet.');
  }

  listCommunityFeed(
    @Payload() _request: ListCommunityFeedRequest,
  ): Promise<ListCommunityFeedResponse> {
    throw new AppError('NOT_IMPLEMENTED', 'ListCommunityFeed is not implemented yet.');
  }

  /**
   * Best-effort session lookup for an RPC that must stay callable anonymously: reads the
   * `authorization` header directly rather than going through `AuthGuard` (which would reject
   * the whole call on a missing/invalid token). An absent header is the normal anonymous case;
   * a present-but-invalid/expired token degrades to anonymous too rather than failing an
   * otherwise-public read — only `ListHomeFeed` (behind `AuthGuard`) treats a bad token as an
   * error.
   */
  private async optionalViewerActorId(metadata: Metadata | undefined): Promise<string | undefined> {
    const values = metadata?.get(AUTHORIZATION_METADATA_KEY) ?? [];
    const header = values[0];
    const raw = typeof header === 'string' ? header : header?.toString('utf8');
    if (raw === undefined || !raw.toLowerCase().startsWith(BEARER_PREFIX)) return undefined;

    const token = raw.slice(BEARER_PREFIX.length).trim();
    if (token.length === 0) return undefined;

    try {
      const claims = await this.tokens.verifyAccessToken(token);
      return claims.actorId;
    } catch {
      // Malformed/expired/wrong-node token on an anonymous-readable RPC: degrade to
      // anonymous rather than fail the read (see the method doc above).
      return undefined;
    }
  }
}

function toResponse(page: FeedPage): {
  posts: ProtoPost[];
  page: { nextCursor: string; hasMore: boolean };
} {
  return {
    posts: page.posts.map(toProtoPost),
    page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
  };
}

/** `@CurrentSession()` is typed optional only because a ts-proto controller method signature
 * has no room for a required third parameter — see `auth.controller.ts`'s copy of this
 * function. `AuthGuard` has already run, so `undefined` here means the guard was forgotten. */
function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}
