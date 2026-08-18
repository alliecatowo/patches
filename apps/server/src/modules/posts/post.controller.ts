import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type CreatePostRequest,
  type CreatePostResponse,
  type DeletePostRequest,
  type DeletePostResponse,
  type GetPostRequest,
  type GetPostResponse,
  type ListRepliesRequest,
  type ListRepliesResponse,
  type PostServiceController,
  PostServiceControllerMethods,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims, TokenService } from '../auth/token.service.js';
import { postVisibilityFromProto, toProtoPost } from './post.mapper.js';
import { PostService } from './post.service.js';

const AUTHORIZATION_METADATA_KEY = 'authorization';
const BEARER_PREFIX = 'bearer ';

/**
 * Transport adapter for `patches.v1.PostService` — protobuf in, protobuf out, no business
 * logic (spec §128). `CreatePost`/`DeletePost` require an authenticated session (`AuthGuard`,
 * reused from `AuthModule` exactly as every other feature module does); `GetPost`/
 * `ListReplies` stay anonymous-readable but honor a *present* bearer token too, same pattern
 * as `FeedController.optionalViewerActorId` — an authenticated caller gets block-aware
 * filtering (spec §62) and their own `viewer_state` even on an RPC that doesn't require login.
 */
@Controller()
@PostServiceControllerMethods()
export class PostController implements PostServiceController {
  constructor(
    private readonly posts: PostService,
    private readonly tokens: TokenService,
  ) {}

  @UseGuards(AuthGuard)
  async createPost(
    @Payload() request: CreatePostRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<CreatePostResponse> {
    const post = await this.posts.createPost({
      authorActorId: requireSession(session).actorId,
      clientRequestId: request.clientRequestId,
      ...optional('body', request.body),
      ...optional('linkUrl', request.linkUrl),
      visibility: postVisibilityFromProto(request.visibility),
      ...optional('contentWarning', request.contentWarning),
      ...optional('inReplyToId', request.inReplyToId),
      mediaIds: request.mediaIds,
    });
    return { post: toProtoPost(post) };
  }

  async getPost(
    @Payload() request: GetPostRequest,
    @Ctx() metadata?: Metadata,
  ): Promise<GetPostResponse> {
    const viewerActorId = await this.optionalViewerActorId(metadata);
    const post = await this.posts.getPost(request.id, viewerActorId);
    return { post: toProtoPost(post) };
  }

  @UseGuards(AuthGuard)
  async deletePost(
    @Payload() request: DeletePostRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<DeletePostResponse> {
    const post = await this.posts.deletePost(requireSession(session).actorId, request.id);
    return { post: toProtoPost(post) };
  }

  async listReplies(
    @Payload() request: ListRepliesRequest,
    @Ctx() metadata?: Metadata,
  ): Promise<ListRepliesResponse> {
    const viewerActorId = await this.optionalViewerActorId(metadata);
    const result = await this.posts.listReplies(
      request.postId,
      request.cursor,
      request.limit,
      request.maxDepth,
      viewerActorId,
    );
    return {
      posts: result.posts.map(toProtoPost),
      page: { nextCursor: result.nextCursor, hasMore: result.hasMore },
    };
  }

  /**
   * Best-effort session lookup for an RPC that must stay callable anonymously — same
   * implementation as `FeedController.optionalViewerActorId`, not shared across modules for
   * the same reason `post.controller.ts`'s other small helpers aren't (see `blank`/`optional`
   * below): pulling in a cross-module import for three lines costs more than it saves.
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
      // Malformed/expired/wrong-node token on an anonymous-readable RPC: degrade to anonymous
      // rather than fail the read (see `FeedController`'s copy of this method).
      return undefined;
    }
  }
}

/** `''` is protobuf's only representation of an unset scalar; the service wants `undefined`. */
function blank(value: string): string | undefined {
  return value.length === 0 ? undefined : value;
}

/**
 * Builds `{ key: value }` or `{}`, so an unset protobuf scalar never becomes an explicit
 * `undefined` property — which `exactOptionalPropertyTypes` rightly treats as different from
 * an absent one. Same helper as `auth.controller.ts`; not shared across modules because it is
 * three lines and pulling in a cross-module import for it would cost more than it saves.
 */
function optional<K extends string>(
  key: K,
  value: string,
): Record<K, string> | Record<never, never> {
  const trimmed = blank(value);
  return trimmed === undefined ? {} : { [key]: trimmed };
}

/**
 * `@CurrentSession()` is typed optional only because a ts-proto controller method signature
 * has no room for a required third parameter — see `auth.controller.ts`'s copy of this
 * function. `AuthGuard` has already run on every method that calls this, so `undefined` here
 * means the guard was forgotten, reported as an authentication failure rather than a crash.
 */
function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}
