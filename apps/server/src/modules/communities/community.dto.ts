import type { CommunityInviteStatus, CommunityRole } from '@patches/database';

import type { ActorSummary } from '../auth/auth.dto.js';

/**
 * `CommunityService`'s own vocabulary (spec §128–129) — never a `Community`/`CommunityMember`/
 * `CommunityInvite` entity past this layer. `viewerRole` adds `'NONE'` on top of the database
 * `CommunityRole` union for the same reason `RelationshipView.state` does in
 * `modules/graph/graph.dto.ts`: "not a member" is the absence of a `community_members` row,
 * not a role value that row ever stores.
 */
export type ViewerCommunityRole = CommunityRole | 'NONE';

export interface CommunityView {
  id: string;
  name: string;
  displayName: string;
  description: string;
  rules: string;
  createdBy: ActorSummary;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  counts: {
    members: number;
    posts: number;
  };
  viewerRole: ViewerCommunityRole;
}

export interface CommunityMemberView {
  actor: ActorSummary;
  role: CommunityRole;
  joinedAt: Date;
}

export interface CommunityInviteView {
  id: string;
  communityId: string;
  inviter: ActorSummary;
  invitee: ActorSummary;
  status: CommunityInviteStatus;
  createdAt: Date;
}

export interface CommunityListPage {
  communities: CommunityView[];
  nextCursor: string;
  hasMore: boolean;
}

export interface CommunityMemberListPage {
  members: CommunityMemberView[];
  nextCursor: string;
  hasMore: boolean;
}
