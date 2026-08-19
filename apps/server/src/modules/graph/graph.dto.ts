import type { FollowStatus } from '@patches/database';

import type { ActorProfile } from '../actors/actor.dto.js';

/**
 * `GraphService`'s own vocabulary (spec §128–129) — never a `Follow`/`Block`/`Mute`/
 * `FollowRequest` entity past this layer.
 *
 * `state` mirrors spec §50's future follow states (`NONE`/`PENDING`/`FOLLOWING`); `NONE` is
 * added here even though `FollowStatus` (the database enum) never stores it — see
 * `follow.entity.ts`'s comment on why a `NONE` relationship is the absence of a row.
 * `PENDING` now covers two distinct underlying facts (a remote actor's federation-pending
 * follow, and — since §197.5 — a locked local actor's pending follow request); `requested`
 * disambiguates the latter for the caller's own outbound direction.
 */
export interface RelationshipView {
  state: FollowStatus | 'NONE';
  followedBy: boolean;
  blocking: boolean;
  muting: boolean;
  /** §197.5: true when the caller has a pending follow request outstanding toward the target
   * (equivalent to `state === 'PENDING'` due to a locked-account request, not a remote
   * federation handshake, but kept as an explicit field so a client never has to infer which
   * case `PENDING` means). */
  requested: boolean;
  /** §197.5: true when the target actor has a pending follow request outstanding toward the
   * caller — only meaningful when the caller's own account is locked. */
  requestedBy: boolean;
}

/** `GraphService.followActor`'s result: the resulting relationship, plus whether this call
 * created (or found already outstanding) a pending follow request rather than an immediate
 * follow. */
export interface FollowActorResult {
  relationship: RelationshipView;
  requested: boolean;
}

/** One row of `ListFollowRequests` — the requesting actor's profile (counts left zeroed, same
 * "list summary, not `GetActor`'s guarantee" convention `ActorService.listFollowers`/
 * `listFollowing` already use) plus when the request was made. */
export interface FollowRequestView {
  actor: ActorProfile;
  createdAt: Date;
}

export interface ListFollowRequestsResult {
  requests: FollowRequestView[];
  nextCursor: string;
  hasMore: boolean;
}
