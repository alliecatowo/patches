import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type AppealServiceController,
  AppealServiceControllerMethods,
  type CreateAppealRequest,
  type CreateAppealResponse,
  type GetAppealRequest,
  type GetAppealResponse,
  type ListMyAppealsRequest,
  type ListMyAppealsResponse,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims } from '../auth/token.service.js';
import { SuspensionTolerantAuthGuard } from '../moderation/suspension-tolerant-auth.guard.js';
import { toProtoAppeal } from './appeal.mapper.js';
import { AppealService } from './appeal.service.js';

/**
 * Transport adapter for `patches.v1.AppealService` — protobuf in, protobuf out, no business
 * logic (spec §128). Every RPC requires an authenticated session, via
 * `SuspensionTolerantAuthGuard` rather than the usual `AuthGuard` — a suspended account is
 * exactly who needs to appeal (see that guard's doc comment).
 */
@Controller()
@AppealServiceControllerMethods()
export class AppealController implements AppealServiceController {
  constructor(private readonly appeals: AppealService) {}

  @UseGuards(SuspensionTolerantAuthGuard)
  async createAppeal(
    @Payload() request: CreateAppealRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<CreateAppealResponse> {
    const appeal = await this.appeals.createAppeal(
      requireSession(session).actorId,
      request.moderationNoticeId,
      request.statement,
    );
    return { appeal: toProtoAppeal(appeal) };
  }

  @UseGuards(SuspensionTolerantAuthGuard)
  async getAppeal(
    @Payload() request: GetAppealRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<GetAppealResponse> {
    const appeal = await this.appeals.getAppeal(requireSession(session).actorId, request.id);
    return { appeal: toProtoAppeal(appeal) };
  }

  @UseGuards(SuspensionTolerantAuthGuard)
  async listMyAppeals(
    @Payload() request: ListMyAppealsRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListMyAppealsResponse> {
    const result = await this.appeals.listMyAppeals(
      requireSession(session).actorId,
      request.cursor,
      request.limit,
    );
    return {
      appeals: result.appeals.map(toProtoAppeal),
      page: { nextCursor: result.nextCursor, hasMore: result.hasMore },
    };
  }
}

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}
