import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type BanFromCommunityRequest,
  type BanFromCommunityResponse,
  type Community as ProtoCommunity,
  type CommunityMember as ProtoCommunityMember,
  CommunityRole,
  type CommunityServiceController,
  CommunityServiceControllerMethods,
  type CreateCommunityRequest,
  type CreateCommunityResponse,
  type GetCommunityRequest,
  type GetCommunityResponse,
  type InviteToCommunityRequest,
  type InviteToCommunityResponse,
  type JoinCommunityRequest,
  type JoinCommunityResponse,
  type LeaveCommunityRequest,
  type LeaveCommunityResponse,
  type ListCommunitiesRequest,
  type ListCommunitiesResponse,
  type ListCommunityMembersRequest,
  type ListCommunityMembersResponse,
  type RemovePostFromCommunityRequest,
  type RemovePostFromCommunityResponse,
  type RespondToCommunityInviteRequest,
  type RespondToCommunityInviteResponse,
  type SetCommunityRoleRequest,
  type SetCommunityRoleResponse,
  type UpdateCommunityRequest,
  type UpdateCommunityResponse,
} from '@patches/proto/nest';
import type { CommunityRole as DbCommunityRole } from '@patches/database';

import { AppError } from '../../common/errors/app-error.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims, TokenService } from '../auth/token.service.js';
import type { CommunityListPage, CommunityMemberListPage } from './community.dto.js';
import {
  toProtoCommunity,
  toProtoCommunityInvite,
  toProtoCommunityMember,
} from './community.mapper.js';
import { CommunityService } from './community.service.js';

const AUTHORIZATION_METADATA_KEY = 'authorization';
const BEARER_PREFIX = 'bearer ';

/** Transport-only adapter for `patches.v1.CommunityService` (§128–129). Public reads accept
 * an optional bearer token so `viewer_role` remains truthful; every mutation is guarded. */
@Controller()
@CommunityServiceControllerMethods()
export class CommunityController implements CommunityServiceController {
  constructor(
    private readonly communities: CommunityService,
    private readonly tokens: TokenService,
  ) {}

  @UseGuards(AuthGuard)
  async createCommunity(
    @Payload() request: CreateCommunityRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<CreateCommunityResponse> {
    const claims = requireSession(session);
    const community = await this.communities.createCommunity({
      actorId: claims.actorId,
      clientRequestId: request.clientRequestId,
      name: request.name,
      displayName: request.displayName,
      description: request.description,
      rules: request.rules,
      isPublic: request.isPublic,
    });
    return { community: toProtoCommunity(community) };
  }

  async getCommunity(
    @Payload() request: GetCommunityRequest,
    @Ctx() metadata?: Metadata,
  ): Promise<GetCommunityResponse> {
    const viewerActorId = await this.optionalViewerActorId(metadata);
    return {
      community: toProtoCommunity(await this.communities.getCommunity(request.id, viewerActorId)),
    };
  }

  async listCommunities(
    @Payload() request: ListCommunitiesRequest,
    @Ctx() metadata?: Metadata,
  ): Promise<ListCommunitiesResponse> {
    const viewerActorId = await this.optionalViewerActorId(metadata);
    return toCommunityListResponse(
      await this.communities.listCommunities(request.cursor, request.limit, viewerActorId),
    );
  }

  @UseGuards(AuthGuard)
  async joinCommunity(
    @Payload() request: JoinCommunityRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<JoinCommunityResponse> {
    return {
      community: toProtoCommunity(
        await this.communities.joinCommunity(requireSession(session).actorId, request.communityId),
      ),
    };
  }

  @UseGuards(AuthGuard)
  async leaveCommunity(
    @Payload() request: LeaveCommunityRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<LeaveCommunityResponse> {
    return {
      community: toProtoCommunity(
        await this.communities.leaveCommunity(requireSession(session).actorId, request.communityId),
      ),
    };
  }

  async listCommunityMembers(
    @Payload() request: ListCommunityMembersRequest,
  ): Promise<ListCommunityMembersResponse> {
    return toMemberListResponse(
      await this.communities.listCommunityMembers(
        request.communityId,
        request.cursor,
        request.limit,
      ),
    );
  }

  @UseGuards(AuthGuard)
  async updateCommunity(
    @Payload() request: UpdateCommunityRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<UpdateCommunityResponse> {
    return {
      community: toProtoCommunity(
        await this.communities.updateCommunity(requireSession(session).actorId, {
          id: request.id,
          displayName: request.displayName,
          description: request.description,
          rules: request.rules,
          isPublic: request.isPublic,
          updateMask: fieldMaskPaths(request.updateMask),
        }),
      ),
    };
  }

  @UseGuards(AuthGuard)
  async setCommunityRole(
    @Payload() request: SetCommunityRoleRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<SetCommunityRoleResponse> {
    const member = await this.communities.setCommunityRole(
      requireSession(session).actorId,
      request.communityId,
      request.actorId,
      roleFromProto(request.role),
    );
    return { member: toProtoCommunityMember(member) };
  }

  @UseGuards(AuthGuard)
  async removePostFromCommunity(
    @Payload() request: RemovePostFromCommunityRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<RemovePostFromCommunityResponse> {
    await this.communities.removePostFromCommunity(
      requireSession(session).actorId,
      request.communityId,
      request.postId,
    );
    return {};
  }

  @UseGuards(AuthGuard)
  async banFromCommunity(
    @Payload() request: BanFromCommunityRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<BanFromCommunityResponse> {
    await this.communities.banFromCommunity(
      requireSession(session).actorId,
      request.communityId,
      request.actorId,
      request.reason,
    );
    return {};
  }

  @UseGuards(AuthGuard)
  async inviteToCommunity(
    @Payload() request: InviteToCommunityRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<InviteToCommunityResponse> {
    const invite = await this.communities.inviteToCommunity(
      requireSession(session).actorId,
      request.communityId,
      request.inviteeActorId,
    );
    return { invite: toProtoCommunityInvite(invite) };
  }

  @UseGuards(AuthGuard)
  async respondToCommunityInvite(
    @Payload() request: RespondToCommunityInviteRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<RespondToCommunityInviteResponse> {
    const invite = await this.communities.respondToCommunityInvite(
      requireSession(session).actorId,
      request.inviteId,
      request.accept,
    );
    return { invite: toProtoCommunityInvite(invite) };
  }

  private async optionalViewerActorId(metadata: Metadata | undefined): Promise<string | undefined> {
    const values = metadata?.get(AUTHORIZATION_METADATA_KEY) ?? [];
    const header = values[0];
    const raw = typeof header === 'string' ? header : header?.toString('utf8');
    if (raw === undefined || !raw.toLowerCase().startsWith(BEARER_PREFIX)) return undefined;
    const token = raw.slice(BEARER_PREFIX.length).trim();
    if (token.length === 0) return undefined;
    try {
      return (await this.tokens.verifyAccessToken(token)).actorId;
    } catch {
      return undefined;
    }
  }
}

function toCommunityListResponse(page: CommunityListPage): {
  communities: ProtoCommunity[];
  page: { nextCursor: string; hasMore: boolean };
} {
  return {
    communities: page.communities.map(toProtoCommunity),
    page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
  };
}

function toMemberListResponse(page: CommunityMemberListPage): {
  members: ProtoCommunityMember[];
  page: { nextCursor: string; hasMore: boolean };
} {
  return {
    members: page.members.map(toProtoCommunityMember),
    page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
  };
}

export function roleFromProto(role: CommunityRole): DbCommunityRole {
  if (role === CommunityRole.COMMUNITY_ROLE_MEMBER) return 'MEMBER';
  if (role === CommunityRole.COMMUNITY_ROLE_MODERATOR) return 'MODERATOR';
  throw AppError.validation('role must be MEMBER or MODERATOR.');
}

function fieldMaskPaths(mask: unknown): string[] {
  if (Array.isArray(mask)) return mask as string[];
  if (typeof mask === 'object' && mask !== null && 'paths' in mask) {
    const paths = (mask as { paths?: unknown }).paths;
    if (Array.isArray(paths)) return paths as string[];
  }
  return [];
}

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}
