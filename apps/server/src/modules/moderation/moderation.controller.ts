import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type BlockActorRequest,
  type BlockActorResponse,
  type ListBlocksRequest,
  type ListBlocksResponse,
  type ListModerationLogRequest,
  type ListModerationLogResponse,
  type ListMutesRequest,
  type ListMutesResponse,
  type ListMyModerationNoticesRequest,
  type ListMyModerationNoticesResponse,
  type ModerationServiceController,
  ModerationServiceControllerMethods,
  type MuteActorRequest,
  type MuteActorResponse,
  type ReportActorRequest,
  type ReportActorResponse,
  type ReportMessageRequest,
  type ReportMessageResponse,
  type ReportPostRequest,
  type ReportPostResponse,
  type UnblockActorRequest,
  type UnblockActorResponse,
  type UnmuteActorRequest,
  type UnmuteActorResponse,
} from '@patches/proto/nest';

import { getRequestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims } from '../auth/token.service.js';
import { toProtoActor } from '../auth/auth.mapper.js';
import { toProtoRelationship } from '../graph/graph.mapper.js';
import { reportReasonFromProto } from './moderation.mapper.js';
import { ModerationService } from './moderation.service.js';
import { ReportRateLimitService } from './report-rate-limit.service.js';

/**
 * Transport adapter for `patches.v1.ModerationService` — protobuf in, protobuf out, no
 * business logic (spec §128). Every RPC requires an authenticated session: there is no
 * anonymous block/mute/report.
 */
@Controller()
@ModerationServiceControllerMethods()
export class ModerationController implements ModerationServiceController {
  constructor(
    private readonly moderation: ModerationService,
    private readonly reportRateLimit: ReportRateLimitService,
  ) {}

  @UseGuards(AuthGuard)
  async blockActor(
    @Payload() request: BlockActorRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<BlockActorResponse> {
    const relationship = await this.moderation.blockActor(
      requireSession(session).actorId,
      request.actorId,
    );
    return { relationship: toProtoRelationship(relationship) };
  }

  @UseGuards(AuthGuard)
  async unblockActor(
    @Payload() request: UnblockActorRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<UnblockActorResponse> {
    const relationship = await this.moderation.unblockActor(
      requireSession(session).actorId,
      request.actorId,
    );
    return { relationship: toProtoRelationship(relationship) };
  }

  @UseGuards(AuthGuard)
  async muteActor(
    @Payload() request: MuteActorRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<MuteActorResponse> {
    const relationship = await this.moderation.muteActor(
      requireSession(session).actorId,
      request.actorId,
    );
    return { relationship: toProtoRelationship(relationship) };
  }

  @UseGuards(AuthGuard)
  async unmuteActor(
    @Payload() request: UnmuteActorRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<UnmuteActorResponse> {
    const relationship = await this.moderation.unmuteActor(
      requireSession(session).actorId,
      request.actorId,
    );
    return { relationship: toProtoRelationship(relationship) };
  }

  @UseGuards(AuthGuard)
  async listBlocks(
    @Payload() request: ListBlocksRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListBlocksResponse> {
    const result = await this.moderation.listBlocks(
      requireSession(session).actorId,
      request.cursor,
      request.limit,
    );
    return {
      actors: result.actors.map(toProtoActor),
      page: { nextCursor: result.nextCursor, hasMore: result.hasMore },
    };
  }

  @UseGuards(AuthGuard)
  async listMutes(
    @Payload() request: ListMutesRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListMutesResponse> {
    const result = await this.moderation.listMutes(
      requireSession(session).actorId,
      request.cursor,
      request.limit,
    );
    return {
      actors: result.actors.map(toProtoActor),
      page: { nextCursor: result.nextCursor, hasMore: result.hasMore },
    };
  }

  @UseGuards(AuthGuard)
  async reportPost(
    @Payload() request: ReportPostRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ReportPostResponse> {
    this.reportRateLimit.consume(getRequestContext()?.peer);
    const reportId = await this.moderation.reportPost(
      requireSession(session).actorId,
      request.postId,
      reportReasonFromProto(request.reason),
      request.details,
    );
    return { reportId };
  }

  @UseGuards(AuthGuard)
  async reportActor(
    @Payload() request: ReportActorRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ReportActorResponse> {
    this.reportRateLimit.consume(getRequestContext()?.peer);
    const reportId = await this.moderation.reportActor(
      requireSession(session).actorId,
      request.actorId,
      reportReasonFromProto(request.reason),
      request.details,
    );
    return { reportId };
  }

  @UseGuards(AuthGuard)
  async reportMessage(
    @Payload() request: ReportMessageRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ReportMessageResponse> {
    this.reportRateLimit.consume(getRequestContext()?.peer);
    const reportId = await this.moderation.reportMessage(
      requireSession(session).actorId,
      request.messageId,
      reportReasonFromProto(request.reason),
      request.details,
    );
    return { reportId };
  }

  /**
   * P14-001 lands the `patches.v1` contract only; the `moderation_log_entries` table and its
   * projection service are a follow-up task (§201.4). An honest `NOT_IMPLEMENTED` (§176's
   * rule — an RPC that exists in the schema but isn't implemented on this node yet) rather
   * than a fabricated empty page, which would silently lie about there being no log at all.
   */
  listModerationLog(_request: ListModerationLogRequest): ListModerationLogResponse {
    throw new AppError('NOT_IMPLEMENTED', 'The public moderation log is not available yet.');
  }

  /** See `listModerationLog` — `admin_audit_log`'s read projection (§201.2) is a follow-up
   * task. */
  @UseGuards(AuthGuard)
  listMyModerationNotices(
    @Payload() _request: ListMyModerationNoticesRequest,
  ): ListMyModerationNoticesResponse {
    throw new AppError('NOT_IMPLEMENTED', 'Moderation notices are not available yet.');
  }
}

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}
