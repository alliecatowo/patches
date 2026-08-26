import { dateToTimestamp } from '@patches/proto';
import type { Actor as ProtoActor, Nameplate as ProtoNameplate } from '@patches/proto';

import type { ActorProfile, NameplateSummary } from './actor.dto.js';

/** Application DTO → protobuf message (spec §128), field-by-field — see `auth.mapper.ts`'s
 * comment on why never a spread. `avatar` is unset: no `MediaService` yet. */
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
    homeServer: profile.homeServer ?? '',
    joinedAt: dateToTimestamp(profile.joinedAt),
    counts: {
      followers: profile.counts.followers,
      following: profile.counts.following,
      posts: profile.counts.posts,
    },
    nameplate: profile.nameplate === null ? undefined : toProtoNameplate(profile.nameplate),
    flair:
      profile.flair === null
        ? undefined
        : {
            document: profile.flair.document,
            updatedAt: dateToTimestamp(profile.flair.updatedAt),
          },
    pinnedPostIds: [...profile.pinnedPostIds],
  };
}

function toProtoNameplate(nameplate: NameplateSummary): ProtoNameplate {
  return {
    nameColor: nameplate.nameColor,
    glyph: nameplate.glyph,
    badges: [...nameplate.badges],
    avatarFrame: nameplate.avatarFrame,
    statusLine: nameplate.statusLine,
    profileBorder: nameplate.profileBorder,
  };
}
