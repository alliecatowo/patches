import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type AcceptFollowRequestRequest,
  type AcceptFollowRequestResponse,
  type Actor as ProtoActor,
  type FollowActorRequest,
  type FollowActorResponse,
  type GetRelationshipRequest,
  type GetRelationshipResponse,
  type ListFollowRequestsRequest,
  type ListFollowRequestsResponse,
  type ListMutualFollowsRequest,
  type ListMutualFollowsResponse,
  type RejectFollowRequestRequest,
  type RejectFollowRequestResponse,
  type SocialGraphServiceController,
  SocialGraphServiceControllerMethods,
  type UnfollowActorRequest,
  type UnfollowActorResponse,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { RequirePrivacyAckGuard } from '../../common/guards/require-privacy-ack.guard.js';
import { toProtoActor } from '../actors/actor.mapper.js';
import { type ActorListPage } from '../actors/actor.service.js';
import { ActorService } from '../actors/actor.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims } from '../auth/token.service.js';
import { toProtoFollowRequest, toProtoRelationship } from './graph.mapper.js';
import { GraphService } from './graph.service.js';

/**
 * Transport adapter for `patches.v1.SocialGraphService` — protobuf in, protobuf out, no
 * business logic (spec §128). `FollowActor`/`UnfollowActor`/`GetRelationship`/
 * `ListFollowRequests`/`AcceptFollowRequest`/`RejectFollowRequest` all require an
 * authenticated session: there is no relationship to follow/unfollow/report, and no request
 * queue to list/accept/reject, for an anonymous caller. `ListMutualFollows` (B-024) is the one
 * exception — readable anonymously, same as `ActorService.ListFollowers`/`ListFollowing`,
 * because it backs a public Page's `Friends` block (`apps/tui`'s `PageScreen`), which a
 * signed-out visitor can view.
 */
@Controller()
@SocialGraphServiceControllerMethods()
export class GraphController implements SocialGraphServiceController {
  constructor(
    private readonly graph: GraphService,
    private readonly actors: ActorService,
  ) {}

  @UseGuards(AuthGuard, RequirePrivacyAckGuard)
  async followActor(
    @Payload() request: FollowActorRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<FollowActorResponse> {
    const result = await this.graph.followActor(requireSession(session).actorId, request.actorId);
    return { relationship: toProtoRelationship(result.relationship), requested: result.requested };
  }

  @UseGuards(AuthGuard)
  async unfollowActor(
    @Payload() request: UnfollowActorRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<UnfollowActorResponse> {
    const relationship = await this.graph.unfollowActor(
      requireSession(session).actorId,
      request.actorId,
    );
    return { relationship: toProtoRelationship(relationship) };
  }

  @UseGuards(AuthGuard)
  async getRelationship(
    @Payload() request: GetRelationshipRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<GetRelationshipResponse> {
    const relationship = await this.graph.getRelationship(
      requireSession(session).actorId,
      request.actorId,
    );
    return { relationship: toProtoRelationship(relationship) };
  }

  /** Anonymous-readable, unlike this controller's other RPCs — see the class doc comment.
   * Mutuality is always computed relative to `request.actorId`, never the caller's own
   * identity, so there is nothing here that needs a session. */
  async listMutualFollows(
    @Payload() request: ListMutualFollowsRequest,
  ): Promise<ListMutualFollowsResponse> {
    return toListResponse(
      await this.actors.listMutualFollows(request.actorId, request.cursor, request.limit),
    );
  }

  @UseGuards(AuthGuard)
  async listFollowRequests(
    @Payload() request: ListFollowRequestsRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListFollowRequestsResponse> {
    const result = await this.graph.listFollowRequests(
      requireSession(session).actorId,
      request.cursor,
      request.limit,
    );
    return {
      requests: result.requests.map(toProtoFollowRequest),
      page: { nextCursor: result.nextCursor, hasMore: result.hasMore },
    };
  }

  @UseGuards(AuthGuard)
  async acceptFollowRequest(
    @Payload() request: AcceptFollowRequestRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<AcceptFollowRequestResponse> {
    const relationship = await this.graph.acceptFollowRequest(
      requireSession(session).actorId,
      request.actorId,
    );
    return { relationship: toProtoRelationship(relationship) };
  }

  @UseGuards(AuthGuard)
  async rejectFollowRequest(
    @Payload() request: RejectFollowRequestRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<RejectFollowRequestResponse> {
    await this.graph.rejectFollowRequest(requireSession(session).actorId, request.actorId);
    return {};
  }
}

function toListResponse(page: ActorListPage): {
  actors: ProtoActor[];
  page: { nextCursor: string; hasMore: boolean };
} {
  return {
    actors: page.actors.map(toProtoActor),
    page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
  };
}

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}
