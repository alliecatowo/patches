import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type FollowActorRequest,
  type FollowActorResponse,
  type GetRelationshipRequest,
  type GetRelationshipResponse,
  type SocialGraphServiceController,
  SocialGraphServiceControllerMethods,
  type UnfollowActorRequest,
  type UnfollowActorResponse,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims } from '../auth/token.service.js';
import { toProtoRelationship } from './graph.mapper.js';
import { GraphService } from './graph.service.js';

/**
 * Transport adapter for `patches.v1.SocialGraphService` — protobuf in, protobuf out, no
 * business logic (spec §128). Every RPC here requires an authenticated session: there is no
 * relationship to follow/unfollow/report for an anonymous caller.
 */
@Controller()
@SocialGraphServiceControllerMethods()
export class GraphController implements SocialGraphServiceController {
  constructor(private readonly graph: GraphService) {}

  @UseGuards(AuthGuard)
  async followActor(
    @Payload() request: FollowActorRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<FollowActorResponse> {
    const relationship = await this.graph.followActor(
      requireSession(session).actorId,
      request.actorId,
    );
    return { relationship: toProtoRelationship(relationship) };
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
}

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}
