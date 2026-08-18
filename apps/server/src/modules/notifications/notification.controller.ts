import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type GetUnreadCountRequest,
  type GetUnreadCountResponse,
  type ListNotificationsRequest,
  type ListNotificationsResponse,
  type MarkNotificationsReadRequest,
  type MarkNotificationsReadResponse,
  type NotificationServiceController,
  NotificationServiceControllerMethods,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims } from '../auth/token.service.js';
import { toProtoNotification } from './notification.mapper.js';
import { NotificationsService } from './notification.service.js';

/**
 * Transport adapter for `patches.v1.NotificationService` — protobuf in, protobuf out, no
 * business logic (spec §128). Every RPC requires an authenticated session: there is no such
 * thing as an anonymous notification list.
 */
@Controller()
@NotificationServiceControllerMethods()
export class NotificationController implements NotificationServiceController {
  constructor(private readonly notifications: NotificationsService) {}

  @UseGuards(AuthGuard)
  async listNotifications(
    @Payload() request: ListNotificationsRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListNotificationsResponse> {
    const result = await this.notifications.listNotifications(
      requireSession(session).actorId,
      request.cursor,
      request.limit,
    );
    return {
      notifications: result.notifications.map(toProtoNotification),
      page: { nextCursor: result.nextCursor, hasMore: result.hasMore },
    };
  }

  @UseGuards(AuthGuard)
  async markNotificationsRead(
    @Payload() request: MarkNotificationsReadRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<MarkNotificationsReadResponse> {
    const markedCount = await this.notifications.markNotificationsRead(
      requireSession(session).actorId,
      request.throughId,
      request.markAll,
    );
    return { markedCount };
  }

  @UseGuards(AuthGuard)
  async getUnreadCount(
    @Payload() _request: GetUnreadCountRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<GetUnreadCountResponse> {
    const count = await this.notifications.getUnreadCount(requireSession(session).actorId);
    return { count };
  }
}

/** `@CurrentSession()` is typed optional only because a ts-proto controller method signature
 * has no room for a required third parameter — see `auth.controller.ts`'s copy of this
 * function. `AuthGuard` has already run on every method that calls this. */
function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}
