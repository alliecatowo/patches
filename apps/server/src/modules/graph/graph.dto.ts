import type { FollowStatus } from '@patches/database';

/**
 * `GraphService`'s own vocabulary (spec §128–129) — never a `Follow`/`Block`/`Mute` entity
 * past this layer.
 *
 * `state` mirrors spec §50's future follow states (`NONE`/`PENDING`/`FOLLOWING`); `NONE` is
 * added here even though `FollowStatus` (the database enum) never stores it — see
 * `follow.entity.ts`'s comment on why a `NONE` relationship is the absence of a row.
 */
export interface RelationshipView {
  state: FollowStatus | 'NONE';
  followedBy: boolean;
  blocking: boolean;
  muting: boolean;
}
