import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type ListMutedTagsRequest,
  type ListMutedTagsResponse,
  type MuteTagRequest,
  type MuteTagResponse,
  type SearchTagsRequest,
  type SearchTagsResponse,
  type Tag as ProtoTag,
  type TagServiceController,
  TagServiceControllerMethods,
  type UnmuteTagRequest,
  type UnmuteTagResponse,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims } from '../auth/token.service.js';
import { type TagListPage } from './tag.dto.js';
import { toProtoTag } from './tag.mapper.js';
import { TagService } from './tag.service.js';

/**
 * Transport adapter for `patches.v1.TagService` — protobuf in, protobuf out, no business
 * logic (spec §128). `SearchTags` stays anonymous-readable (tag search is public, like actor
 * search); mutes always require an authenticated session — there is no such thing as an
 * anonymous mute.
 */
@Controller()
@TagServiceControllerMethods()
export class TagController implements TagServiceController {
  constructor(private readonly tags: TagService) {}

  async searchTags(@Payload() request: SearchTagsRequest): Promise<SearchTagsResponse> {
    return toResponse(await this.tags.searchTags(request.query, request.cursor, request.limit));
  }

  @UseGuards(AuthGuard)
  async muteTag(
    @Payload() request: MuteTagRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<MuteTagResponse> {
    await this.tags.muteTag(requireSession(session).actorId, request.tagId);
    return {};
  }

  @UseGuards(AuthGuard)
  async unmuteTag(
    @Payload() request: UnmuteTagRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<UnmuteTagResponse> {
    await this.tags.unmuteTag(requireSession(session).actorId, request.tagId);
    return {};
  }

  @UseGuards(AuthGuard)
  async listMutedTags(
    @Payload() request: ListMutedTagsRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListMutedTagsResponse> {
    return toResponse(
      await this.tags.listMutedTags(requireSession(session).actorId, request.cursor, request.limit),
    );
  }
}

function toResponse(page: TagListPage): {
  tags: ProtoTag[];
  page: { nextCursor: string; hasMore: boolean };
} {
  return {
    tags: page.tags.map(toProtoTag),
    page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
  };
}

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}
