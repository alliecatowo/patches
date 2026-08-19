import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import { timestampToDate } from '@patches/proto';
import {
  type ApplyLabelRequest,
  type ApplyLabelResponse,
  type CreateLabelerRequest,
  type CreateLabelerResponse,
  type GetLabelerRequest,
  type GetLabelerResponse,
  type Label as ProtoLabel,
  type Labeler as ProtoLabeler,
  type LabelServiceController,
  LabelServiceControllerMethods,
  type ListLabelersRequest,
  type ListLabelersResponse,
  type ListLabelsOnSubjectRequest,
  type ListLabelsOnSubjectResponse,
  type RetractLabelRequest,
  type RetractLabelResponse,
  type SetLabelerSubscriptionActionRequest,
  type SetLabelerSubscriptionActionResponse,
  type SubscribeLabelerRequest,
  type SubscribeLabelerResponse,
  type UnsubscribeLabelerRequest,
  type UnsubscribeLabelerResponse,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims } from '../auth/token.service.js';
import { labelActionFromProto } from './label-validation.js';
import type { LabelerListPage, LabelListPage } from './label.dto.js';
import { toProtoLabel, toProtoLabeler } from './label.mapper.js';
import { LabelService } from './label.service.js';

/** Transport-only adapter for `patches.v1.LabelService` (§128–129). `GetLabeler`/
 * `ListLabelers` stay anonymous-readable (a labeler and its vocabulary are public, like a
 * community); every other RPC requires a session — there is no anonymous label operation or
 * self-inspection. */
@Controller()
@LabelServiceControllerMethods()
export class LabelController implements LabelServiceController {
  constructor(private readonly labels: LabelService) {}

  @UseGuards(AuthGuard)
  async createLabeler(
    @Payload() request: CreateLabelerRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<CreateLabelerResponse> {
    const labeler = await this.labels.createLabeler(
      requireSession(session).actorId,
      request.communityId,
      request.vocabulary,
    );
    return { labeler: toProtoLabeler(labeler) };
  }

  async getLabeler(@Payload() request: GetLabelerRequest): Promise<GetLabelerResponse> {
    return { labeler: toProtoLabeler(await this.labels.getLabeler(request.id)) };
  }

  async listLabelers(@Payload() request: ListLabelersRequest): Promise<ListLabelersResponse> {
    return toLabelerListResponse(await this.labels.listLabelers(request.cursor, request.limit));
  }

  @UseGuards(AuthGuard)
  async applyLabel(
    @Payload() request: ApplyLabelRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ApplyLabelResponse> {
    const label = await this.labels.applyLabel(requireSession(session).actorId, {
      labelerId: request.labelerId,
      subjectActorId: request.subjectActorId,
      subjectPostId: request.subjectPostId,
      value: request.value,
      expiresAt: timestampToDate(request.expiresAt),
    });
    return { label: toProtoLabel(label) };
  }

  @UseGuards(AuthGuard)
  async retractLabel(
    @Payload() request: RetractLabelRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<RetractLabelResponse> {
    const label = await this.labels.retractLabel(requireSession(session).actorId, request.labelId);
    return { label: toProtoLabel(label) };
  }

  @UseGuards(AuthGuard)
  async subscribeLabeler(
    @Payload() request: SubscribeLabelerRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<SubscribeLabelerResponse> {
    await this.labels.subscribeLabeler(requireSession(session).actorId, request.labelerId);
    return {};
  }

  @UseGuards(AuthGuard)
  async unsubscribeLabeler(
    @Payload() request: UnsubscribeLabelerRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<UnsubscribeLabelerResponse> {
    await this.labels.unsubscribeLabeler(requireSession(session).actorId, request.labelerId);
    return {};
  }

  @UseGuards(AuthGuard)
  async setLabelerSubscriptionAction(
    @Payload() request: SetLabelerSubscriptionActionRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<SetLabelerSubscriptionActionResponse> {
    await this.labels.setLabelerSubscriptionAction(
      requireSession(session).actorId,
      request.labelerId,
      request.value,
      labelActionFromProto(request.action),
    );
    return {};
  }

  @UseGuards(AuthGuard)
  async listLabelsOnSubject(
    @Payload() request: ListLabelsOnSubjectRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListLabelsOnSubjectResponse> {
    return toLabelListResponse(
      await this.labels.listLabelsOnSubject(
        requireSession(session).actorId,
        request.subjectActorId,
        request.subjectPostId,
        request.cursor,
        request.limit,
      ),
    );
  }
}

function toLabelerListResponse(page: LabelerListPage): {
  labelers: ProtoLabeler[];
  page: { nextCursor: string; hasMore: boolean };
} {
  return {
    labelers: page.labelers.map(toProtoLabeler),
    page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
  };
}

function toLabelListResponse(page: LabelListPage): {
  labels: ProtoLabel[];
  page: { nextCursor: string; hasMore: boolean };
} {
  return {
    labels: page.labels.map(toProtoLabel),
    page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
  };
}

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}
