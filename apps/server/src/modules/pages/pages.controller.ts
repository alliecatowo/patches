import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import { dateToTimestamp } from '@patches/proto';
import {
  type GetPageRequest,
  type GetPageResponse,
  type ListGuestbookRequest,
  type ListGuestbookResponse,
  type ListPageRevisionsRequest,
  type ListPageRevisionsResponse,
  type PageServiceController,
  PageServiceControllerMethods,
  type RemoveGuestbookEntryRequest,
  type RemoveGuestbookEntryResponse,
  type ReportGuestbookEntryRequest,
  type ReportGuestbookEntryResponse,
  type SignGuestbookRequest,
  type SignGuestbookResponse,
  type UpdatePageRequest,
  type UpdatePageResponse,
} from '@patches/proto/nest';

import { getRequestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims, TokenService } from '../auth/token.service.js';
import { reportReasonFromProto } from '../moderation/moderation.mapper.js';
import { GuestbookRateLimitService } from './guestbook-rate-limit.service.js';
import {
  toProtoGuestbookEntry,
  toProtoPageRevisionSummary,
  toProtoPageTheme,
} from './pages.mapper.js';
import { PageService } from './pages.service.js';

const AUTHORIZATION_METADATA_KEY = 'authorization';
const BEARER_PREFIX = 'bearer ';

/**
 * Transport adapter for `patches.v1.PageService` — protobuf in, protobuf out, no business
 * logic (spec §128). `GetPage`/`ListGuestbook` stay anonymous-readable but honor a *present*
 * bearer token for block-aware filtering (spec §62), same `optionalViewerActorId` pattern as
 * `PostController.getPost`/`FeedController`. Every other RPC requires an authenticated
 * session.
 */
@Controller()
@PageServiceControllerMethods()
export class PagesController implements PageServiceController {
  constructor(
    private readonly pages: PageService,
    private readonly tokens: TokenService,
    private readonly guestbookRateLimit: GuestbookRateLimitService,
  ) {}

  async getPage(
    @Payload() request: GetPageRequest,
    @Ctx() metadata?: Metadata,
  ): Promise<GetPageResponse> {
    const viewerActorId = await this.optionalViewerActorId(metadata);
    const result = await this.pages.getPage(request.handle, request.slug, viewerActorId);
    return {
      ownerActorId: result.ownerActorId,
      revisionId: result.revisionId,
      document: Buffer.from(result.document, 'utf8'),
      activeSlug: result.activeSlug,
      theme: toProtoPageTheme(result.theme),
      updatedAt: dateToTimestamp(result.updatedAt),
    };
  }

  @UseGuards(AuthGuard)
  async updatePage(
    @Payload() request: UpdatePageRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<UpdatePageResponse> {
    const result = await this.pages.updatePage(requireSession(session).actorId, request.document);
    return {
      revisionId: result.revisionId,
      document: Buffer.from(result.document, 'utf8'),
      updatedAt: dateToTimestamp(result.updatedAt),
    };
  }

  @UseGuards(AuthGuard)
  async listPageRevisions(
    @Payload() request: ListPageRevisionsRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListPageRevisionsResponse> {
    const result = await this.pages.listPageRevisions(
      requireSession(session).actorId,
      request.cursor,
      request.limit,
    );
    return {
      revisions: result.revisions.map(toProtoPageRevisionSummary),
      page: { nextCursor: result.nextCursor, hasMore: result.hasMore },
    };
  }

  async listGuestbook(
    @Payload() request: ListGuestbookRequest,
    @Ctx() metadata?: Metadata,
  ): Promise<ListGuestbookResponse> {
    const viewerActorId = await this.optionalViewerActorId(metadata);
    const result = await this.pages.listGuestbook(
      request.handle,
      request.slug,
      request.cursor,
      request.limit,
      viewerActorId,
    );
    return {
      entries: result.entries.map(toProtoGuestbookEntry),
      page: { nextCursor: result.nextCursor, hasMore: result.hasMore },
    };
  }

  @UseGuards(AuthGuard)
  async signGuestbook(
    @Payload() request: SignGuestbookRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<SignGuestbookResponse> {
    const actorId = requireSession(session).actorId;
    this.guestbookRateLimit.consume(getRequestContext()?.peer, actorId);
    const entry = await this.pages.signGuestbook(
      actorId,
      request.handle,
      request.slug,
      request.body,
    );
    return { entry: toProtoGuestbookEntry(entry) };
  }

  @UseGuards(AuthGuard)
  async removeGuestbookEntry(
    @Payload() request: RemoveGuestbookEntryRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<RemoveGuestbookEntryResponse> {
    const entry = await this.pages.removeGuestbookEntry(
      requireSession(session).actorId,
      request.entryId,
    );
    return { entry: toProtoGuestbookEntry(entry) };
  }

  @UseGuards(AuthGuard)
  async reportGuestbookEntry(
    @Payload() request: ReportGuestbookEntryRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ReportGuestbookEntryResponse> {
    const reportId = await this.pages.reportGuestbookEntry(
      requireSession(session).actorId,
      request.entryId,
      reportReasonFromProto(request.reason),
      request.details,
    );
    return { reportId };
  }

  /** Best-effort session lookup for an RPC that must stay callable anonymously — same
   * implementation as `PostController.optionalViewerActorId`/`FeedController`'s copy, not
   * shared across modules for the same reason those don't share it either. */
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
      // rather than fail the read (see `PostController`'s copy of this method).
      return undefined;
    }
  }
}

/** `@CurrentSession()` is typed optional only because a ts-proto controller method signature
 * has no room for a required third parameter — see `post.controller.ts`'s copy of this
 * function. `AuthGuard` has already run on every method that calls this. */
function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}
