import { dateToTimestamp } from '@patches/proto';
import type { Actor as ProtoActor } from '@patches/proto';

import type { ActorProfile } from './actor.dto.js';

/** Application DTO → protobuf message (spec §128), field-by-field — see `auth.mapper.ts`'s
 * comment on why never a spread. `avatar`/nameplate are unset: no `MediaService` yet (§173). */
export function toProtoActor(profile: ActorProfile): ProtoActor {
  return {
    id: profile.id,
    handle: profile.handle,
    displayName: profile.displayName ?? '',
    bio: profile.bio ?? '',
    locationText: profile.locationText ?? '',
    websiteUrl: profile.websiteUrl ?? '',
    avatar: undefined,
    isLocal: profile.isLocal,
    joinedAt: dateToTimestamp(profile.joinedAt),
    counts: {
      followers: profile.counts.followers,
      following: profile.counts.following,
      posts: profile.counts.posts,
    },
  };
}
