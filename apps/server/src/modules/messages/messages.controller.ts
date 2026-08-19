import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type CreateConversationRequest,
  type CreateConversationResponse,
  type DeleteMessageRequest,
  type DeleteMessageResponse,
  type DirectMessageServiceController,
  DirectMessageServiceControllerMethods,
  type GetConversationRequest,
  type GetConversationResponse,
  type LeaveConversationRequest,
  type LeaveConversationResponse,
  type ListConversationsRequest,
  type ListConversationsResponse,
  type ListMessageRequestsRequest,
  type ListMessageRequestsResponse,
  type ListMessagesRequest,
  type ListMessagesResponse,
  type MarkConversationReadRequest,
  type MarkConversationReadResponse,
  type RespondToMessageRequestRequest,
  type RespondToMessageRequestResponse,
  type SendMessageRequest,
  type SendMessageResponse,
} from '@patches/proto/nest';

import { getRequestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { RequirePrivacyAckGuard } from '../../common/guards/require-privacy-ack.guard.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims } from '../auth/token.service.js';
import { toProtoConversation, toProtoMessage, toProtoMessageRequest } from './messages.mapper.js';
import { MessagesService } from './messages.service.js';

/**
 * Authenticated protobuf transport adapter for `DirectMessageService`. Message bodies pass
 * straight to `MessagesService`; this controller never logs or places them in an error or
 * diagnostic context (spec §183.4, §192).
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

  async listMessages(
    @Payload() request: ListMessagesRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListMessagesResponse> {
    const page = await this.messages.listMessages(
      requireSession(session).actorId,
      request.conversationId,
      request.cursor,
      request.limit,
    );
    return {
      messages: page.items.map(toProtoMessage),
      page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
    };
  }

  @UseGuards(RequirePrivacyAckGuard)
  async sendMessage(
    @Payload() request: SendMessageRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<SendMessageResponse> {
    const message = await this.messages.sendMessage({
      actorId: requireSession(session).actorId,
      peer: getRequestContext()?.peer,
      clientRequestId: request.clientRequestId,
      conversationId: request.conversationId,
      body: request.body,
    });
    return { message: toProtoMessage(message) };
  }

  async deleteMessage(
    @Payload() request: DeleteMessageRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<DeleteMessageResponse> {
    const message = await this.messages.deleteMessage(requireSession(session).actorId, request.id);
    return { message: toProtoMessage(message) };
  }

  @UseGuards(RequirePrivacyAckGuard)
  async createConversation(
    @Payload() request: CreateConversationRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<CreateConversationResponse> {
    const result = await this.messages.createConversation({
      actorId: requireSession(session).actorId,
      peer: getRequestContext()?.peer,
      clientRequestId: request.clientRequestId,
      recipientActorIds: request.recipientActorIds,
      initialBody: request.initialBody,
    });
    return {
      conversation:
        result.conversation === null ? undefined : toProtoConversation(result.conversation),
      request: result.request === null ? undefined : toProtoMessageRequest(result.request),
    };
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

  async listMessageRequests(
    @Payload() request: ListMessageRequestsRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListMessageRequestsResponse> {
    const page = await this.messages.listMessageRequests(
      requireSession(session).actorId,
      request.cursor,
      request.limit,
    );
    return {
      requests: page.items.map(toProtoMessageRequest),
      page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
    };
  }

  async respondToMessageRequest(
    @Payload() request: RespondToMessageRequestRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<RespondToMessageRequestResponse> {
    const result = await this.messages.respondToMessageRequest(
      requireSession(session).actorId,
      request.id,
      request.accept,
    );
    return {
      request: toProtoMessageRequest(result.request),
      conversation:
        result.conversation === null ? undefined : toProtoConversation(result.conversation),
    };
  }
}

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}
