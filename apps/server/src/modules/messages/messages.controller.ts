import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type DirectMessageServiceController,
  DirectMessageServiceControllerMethods,
  type GetConversationRequest,
  type GetConversationResponse,
  type LeaveConversationRequest,
  type LeaveConversationResponse,
  type ListConversationsRequest,
  type ListConversationsResponse,
  type MarkConversationReadRequest,
  type MarkConversationReadResponse,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims } from '../auth/token.service.js';
import { toProtoConversation } from './messages.mapper.js';
import { MessagesService } from './messages.service.js';

/**
 * Authenticated protobuf transport adapter for `DirectMessageService`. Only the generic
 * conversation surface remains here (ADR 0030 §B-095) — content moves entirely through
 * `E2eeService` now, which this controller never touches.
 */
@Controller()
@UseGuards(AuthGuard)
@DirectMessageServiceControllerMethods()
export class MessagesController implements DirectMessageServiceController {
  constructor(private readonly messages: MessagesService) {}

  async listConversations(
    @Payload() request: ListConversationsRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListConversationsResponse> {
    const page = await this.messages.listConversations(
      requireSession(session).actorId,
      request.cursor,
      request.limit,
    );
    return {
      conversations: page.items.map(toProtoConversation),
      page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
    };
  }

  async getConversation(
    @Payload() request: GetConversationRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<GetConversationResponse> {
    const conversation = await this.messages.getConversation(
      requireSession(session).actorId,
      request.id,
    );
    return { conversation: toProtoConversation(conversation) };
  }

  async leaveConversation(
    @Payload() request: LeaveConversationRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<LeaveConversationResponse> {
    await this.messages.leaveConversation(requireSession(session).actorId, request.conversationId);
    return {};
  }

  async markConversationRead(
    @Payload() request: MarkConversationReadRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<MarkConversationReadResponse> {
    await this.messages.markConversationRead(
      requireSession(session).actorId,
      request.conversationId,
      request.throughMessageId,
    );
    return {};
  }
}

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}
