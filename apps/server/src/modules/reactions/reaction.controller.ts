import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type BookmarkPostRequest,
  type BookmarkPostResponse,
  type ListBookmarksRequest,
  type ListBookmarksResponse,
  type ListPostLikersRequest,
  type ListPostLikersResponse,
  type LikePostRequest,
  type LikePostResponse,
  type ReactionServiceController,
  ReactionServiceControllerMethods,
  type UnbookmarkPostRequest,
  type UnbookmarkPostResponse,
  type UnlikePostRequest,
  type UnlikePostResponse,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { toProtoActor } from '../auth/auth.mapper.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims, TokenService } from '../auth/token.service.js';
import { toProtoPost } from '../posts/post.mapper.js';
import { type PostView } from '../posts/post.dto.js';
import { ReactionsService } from './reaction.service.js';

const AUTHORIZATION_METADATA_KEY = 'authorization';
const BEARER_PREFIX = 'bearer ';

/**
 * Transport adapter for `patches.v1.ReactionService` — protobuf in, protobuf out, no business
 * logic (spec §128). Every mutating RPC requires an authenticated session; `ListPostLikers`
 * stays anonymous-readable (same `optionalViewerActorId` pattern as `PostController`/
 * `FeedController`) since "who liked this public post" is public information, but still honors
 * a present bearer token for block-aware filtering.
 */
@Controller()
@ReactionServiceControllerMethods()
export class ReactionController implements ReactionServiceController {
  constructor(
    private readonly reactions: ReactionsService,
    private readonly tokens: TokenService,
  ) {}

  @UseGuards(AuthGuard)
  async likePost(
    @Payload() request: LikePostRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<LikePostResponse> {
    const post = await this.reactions.likePost(requireSession(session).actorId, request.postId);
    return toReactionResponse(post);
  }

  @UseGuards(AuthGuard)
  async unlikePost(
    @Payload() request: UnlikePostRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<UnlikePostResponse> {
    const post = await this.reactions.unlikePost(requireSession(session).actorId, request.postId);
    return toReactionResponse(post);
  }

  @UseGuards(AuthGuard)
  async bookmarkPost(
    @Payload() request: BookmarkPostRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<BookmarkPostResponse> {
    const post = await this.reactions.bookmarkPost(requireSession(session).actorId, request.postId);
    return { viewerState: toReactionResponse(post).viewerState };
  }

  @UseGuards(AuthGuard)
  async unbookmarkPost(
    @Payload() request: UnbookmarkPostRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<UnbookmarkPostResponse> {
    const post = await this.reactions.unbookmarkPost(
      requireSession(session).actorId,
      request.postId,
    );
    return { viewerState: toReactionResponse(post).viewerState };
  }

  @UseGuards(AuthGuard)
  async listBookmarks(
    @Payload() request: ListBookmarksRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListBookmarksResponse> {
    const result = await this.reactions.listBookmarks(
      requireSession(session).actorId,
      request.cursor,
      request.limit,
    );
    return {
      posts: result.posts.map(toProtoPost),
      page: { nextCursor: result.nextCursor, hasMore: result.hasMore },
    };
  }

  async listPostLikers(
    @Payload() request: ListPostLikersRequest,
    @Ctx() metadata?: Metadata,
  ): Promise<ListPostLikersResponse> {
    const viewerActorId = await this.optionalViewerActorId(metadata);
    const result = await this.reactions.listPostLikers(
      request.postId,
      request.cursor,
      request.limit,
      viewerActorId,
    );
    return {
      actors: result.actors.map(toProtoActor),
      page: { nextCursor: result.nextCursor, hasMore: result.hasMore },
    };
  }

  /** Same implementation as `PostController`/`FeedController`'s copy — see their doc comments
   * for why this is not shared across modules. */
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
      return undefined;
    }
  }
}

function toReactionResponse(post: PostView): {
  counts: { replies: number; likes: number };
  viewerState: { liked: boolean; bookmarked: boolean };
} {
  return {
    counts: { replies: post.counts.replyCount, likes: post.counts.likeCount },
    viewerState: { liked: post.viewerState.liked, bookmarked: post.viewerState.bookmarked },
  };
}

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}
