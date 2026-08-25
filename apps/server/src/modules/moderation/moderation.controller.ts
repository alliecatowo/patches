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
  type ReportE2eeMessageRequest,
  type ReportE2eeMessageResponse,
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
import { SuspensionTolerantAuthGuard } from './suspension-tolerant-auth.guard.js';

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

  // `reportE2EeMessage`, not `reportE2eeMessage`: ts-proto's camelCase conversion of the proto
  // RPC name `ReportE2eeMessage` capitalizes the `E` after the digit (`E2Ee`, same pattern as
  // `E2eeService`'s own `getE2EeCapability`) — this must match `ModerationServiceController`'s
  // generated interface exactly or Nest's decorator wiring throws at boot.
  @UseGuards(AuthGuard)
  async reportE2EeMessage(
    @Payload() request: ReportE2eeMessageRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ReportE2eeMessageResponse> {
    this.reportRateLimit.consume(getRequestContext()?.peer);
    const reportId = await this.moderation.reportE2eeMessage(
      requireSession(session).actorId,
      request.logicalMessageId,
      reportReasonFromProto(request.reason),
      request.details,
    );
    return { reportId };
  }

  /** Unauthenticated public transparency log (spec §201.4) — see `ModerationService.
   * listModerationLog`'s doc comment for exactly which entries exist today. */
  async listModerationLog(
    @Payload() request: ListModerationLogRequest,
  ): Promise<ListModerationLogResponse> {
    return this.moderation.listModerationLog(request.cursor, request.limit);
  }

  /** The caller's own moderation notices (spec §201.2). `SuspensionTolerantAuthGuard`, not
   * `AuthGuard` — a suspended account is precisely who needs to read this and file an appeal
   * (see that guard's doc comment). */
  @UseGuards(SuspensionTolerantAuthGuard)
  async listMyModerationNotices(
    @Payload() request: ListMyModerationNoticesRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListMyModerationNoticesResponse> {
    return this.moderation.listMyModerationNotices(
      requireSession(session).actorId,
      request.cursor,
      request.limit,
    );
  }
}

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}
