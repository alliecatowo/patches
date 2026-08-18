import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type ActorServiceController,
  ActorServiceControllerMethods,
  type GetActorByHandleRequest,
  type GetActorByHandleResponse,
  type GetActorRequest,
  type GetActorResponse,
  type ListFollowersRequest,
  type ListFollowersResponse,
  type ListFollowingRequest,
  type ListFollowingResponse,
  type SearchActorsRequest,
  type SearchActorsResponse,
  type UpdateProfileRequest,
  type UpdateProfileResponse,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims } from '../auth/token.service.js';
import { toProtoActor } from './actor.mapper.js';
import { ActorService } from './actor.service.js';

/**
 * Transport adapter for `patches.v1.ActorService` — protobuf in, protobuf out, no business
 * logic (spec §128). `GetActor`/`GetActorByHandle` are readable anonymously; `UpdateProfile`
 * requires an authenticated session and always targets the caller's own actor.
 *
 * `SearchActors`/`ListFollowers`/`ListFollowing` need `SocialGraphService`/search (Phase 3,
 * spec §50, §112) and return `NOT_IMPLEMENTED` rather than an invented empty result.
 */
@Controller()
@ActorServiceControllerMethods()
export class ActorController implements ActorServiceController {
  constructor(private readonly actors: ActorService) {}

  async getActor(@Payload() request: GetActorRequest): Promise<GetActorResponse> {
    return { actor: toProtoActor(await this.actors.getActor(request.id)) };
  }

  async getActorByHandle(
    @Payload() request: GetActorByHandleRequest,
  ): Promise<GetActorByHandleResponse> {
    return { actor: toProtoActor(await this.actors.getActorByHandle(request.handle)) };
  }

  @UseGuards(AuthGuard)
  async updateProfile(
    @Payload() request: UpdateProfileRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<UpdateProfileResponse> {
    const profile = await this.actors.updateProfile({
      actorId: requireSession(session).actorId,
      displayName: request.displayName,
      bio: request.bio,
      locationText: request.locationText,
      websiteUrl: request.websiteUrl,
      updateMask: fieldMaskPaths(request.updateMask),
    });
    return { actor: toProtoActor(profile) };
  }

  searchActors(@Payload() _request: SearchActorsRequest): SearchActorsResponse {
    throw notImplemented('SearchActors');
  }

  listFollowers(@Payload() _request: ListFollowersRequest): ListFollowersResponse {
    throw notImplemented('ListFollowers');
  }

  listFollowing(@Payload() _request: ListFollowingRequest): ListFollowingResponse {
    throw notImplemented('ListFollowing');
  }
}

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}

function notImplemented(rpc: string): AppError {
  return new AppError('NOT_IMPLEMENTED', `${rpc} is not available on this node yet.`);
}

/**
 * `@grpc/proto-loader` — the actual runtime (de)serializer, not ts-proto (see LEARNINGS:
 * proto-stringEnums-runtime-mismatch for the general pattern) — decodes `google.protobuf.
 * FieldMask` as its literal wire shape, `{ paths: string[] }`, not the flat `string[]`
 * ts-proto's generated `UpdateProfileRequest.updateMask` type claims. Verified empirically:
 * an integration call with `update_mask: ["bio"]` crashed `new Set(request.updateMask)` with
 * "object is not iterable" until this unwrapped `.paths` first. Both shapes are accepted so
 * this keeps working if that ever changes.
 */
function fieldMaskPaths(mask: unknown): string[] {
  if (Array.isArray(mask)) return mask as string[];
  if (typeof mask === 'object' && mask !== null && 'paths' in mask) {
    const paths = (mask as { paths?: unknown }).paths;
    if (Array.isArray(paths)) return paths as string[];
  }
  return [];
}
