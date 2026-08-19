import type {
  CommunityInviteStatus as DbCommunityInviteStatus,
  CommunityRole as DbCommunityRole,
} from '@patches/database';
import { dateToTimestamp } from '@patches/proto';
import type {
  Community as ProtoCommunity,
  CommunityInvite as ProtoCommunityInvite,
  CommunityMember as ProtoCommunityMember,
} from '@patches/proto';
import { CommunityInviteStatus, CommunityRole } from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { toProtoActor } from '../auth/auth.mapper.js';
import type {
  CommunityInviteView,
  CommunityMemberView,
  CommunityView,
  ViewerCommunityRole,
} from './community.dto.js';

const ROLE_TO_PROTO: Readonly<Record<ViewerCommunityRole, CommunityRole>> = Object.freeze({
  NONE: CommunityRole.COMMUNITY_ROLE_UNSPECIFIED,
  MEMBER: CommunityRole.COMMUNITY_ROLE_MEMBER,
  MODERATOR: CommunityRole.COMMUNITY_ROLE_MODERATOR,
});

const INVITE_STATUS_TO_PROTO: Readonly<Record<DbCommunityInviteStatus, CommunityInviteStatus>> =
  Object.freeze({
    PENDING: CommunityInviteStatus.COMMUNITY_INVITE_STATUS_PENDING,
    ACCEPTED: CommunityInviteStatus.COMMUNITY_INVITE_STATUS_ACCEPTED,
    DECLINED: CommunityInviteStatus.COMMUNITY_INVITE_STATUS_DECLINED,
  });

/** Application DTO → protobuf message (spec §128), field-by-field. */
export function toProtoCommunity(view: CommunityView): ProtoCommunity {
  return {
    id: view.id,
    name: view.name,
    displayName: view.displayName,
    description: view.description,
    rules: view.rules,
    createdBy: toProtoActor(view.createdBy),
    isPublic: view.isPublic,
    createdAt: dateToTimestamp(view.createdAt),
    updatedAt: dateToTimestamp(view.updatedAt),
    counts: { members: view.counts.members, posts: view.counts.posts },
    viewerRole: ROLE_TO_PROTO[view.viewerRole],
  };
}

export function toProtoCommunityMember(view: CommunityMemberView): ProtoCommunityMember {
  return {
    actor: toProtoActor(view.actor),
    role: ROLE_TO_PROTO[view.role],
    joinedAt: dateToTimestamp(view.joinedAt),
  };
}

export function toProtoCommunityInvite(view: CommunityInviteView): ProtoCommunityInvite {
  return {
    id: view.id,
    communityId: view.communityId,
    inviter: toProtoActor(view.inviter),
    invitee: toProtoActor(view.invitee),
    status: INVITE_STATUS_TO_PROTO[view.status],
    createdAt: dateToTimestamp(view.createdAt),
  };
}

/** Protobuf message → application/persistence vocabulary (spec §128) — the only two writable
 * roles map through; anything else (unspecified/unrecognized) is a validation error, not a
 * transport concern, so it belongs here rather than in the controller. */
export function roleFromProto(role: CommunityRole): DbCommunityRole {
  if (role === CommunityRole.COMMUNITY_ROLE_MEMBER) return 'MEMBER';
  if (role === CommunityRole.COMMUNITY_ROLE_MODERATOR) return 'MODERATOR';
  throw AppError.validation('role must be MEMBER or MODERATOR.');
}
