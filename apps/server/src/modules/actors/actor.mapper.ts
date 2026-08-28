import { dateToTimestamp } from '@patches/proto';
import { NameTagStyle, ProfileFrame } from '@patches/proto/nest';
import type { Actor as ProtoActor, Nameplate as ProtoNameplate } from '@patches/proto';

import type { ActorProfile, NameplateSummary } from './actor.dto.js';
import type { ProfileFrameValue, NameTagStyleValue } from './validation.js';

const PROFILE_FRAME_TO_PROTO: Readonly<Record<ProfileFrameValue, ProfileFrame>> = Object.freeze({
  NONE: ProfileFrame.PROFILE_FRAME_NONE,
  BORDER: ProfileFrame.PROFILE_FRAME_BORDER,
  GLOW: ProfileFrame.PROFILE_FRAME_GLOW,
  GRADIENT: ProfileFrame.PROFILE_FRAME_GRADIENT,
});

const NAME_TAG_STYLE_TO_PROTO: Readonly<Record<NameTagStyleValue, NameTagStyle>> = Object.freeze({
  NONE: NameTagStyle.NAME_TAG_STYLE_NONE,
  BADGE: NameTagStyle.NAME_TAG_STYLE_BADGE,
  RIBBON: NameTagStyle.NAME_TAG_STYLE_RIBBON,
  PILLED: NameTagStyle.NAME_TAG_STYLE_PILLED,
});

/** Application DTO → protobuf message (spec §128), field-by-field — see `auth.mapper.ts`'s
 * comment on why never a spread. `avatar`/`banner` carry only `media_id`: `url` stays empty,
 * resolved client-side via `MediaService.GetMediaDownload` (`MediaImage`), same as post
 * attachments — the server never inlines a presigned URL into a profile read. */
export function toProtoActor(profile: ActorProfile): ProtoActor {
  return {
    id: profile.id,
    handle: profile.handle,
    displayName: profile.displayName ?? '',
    bio: profile.bio ?? '',
    locationText: profile.locationText ?? '',
    websiteUrl: profile.websiteUrl ?? '',
    avatar:
      profile.avatarMediaId === null ? undefined : { mediaId: profile.avatarMediaId, url: '' },
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
    profileFrame:
      profile.profileFrame === null
        ? ProfileFrame.PROFILE_FRAME_UNSPECIFIED
        : PROFILE_FRAME_TO_PROTO[profile.profileFrame],
    nameTagStyle:
      profile.nameTagStyle === null
        ? NameTagStyle.NAME_TAG_STYLE_UNSPECIFIED
        : NAME_TAG_STYLE_TO_PROTO[profile.nameTagStyle],
    accentColor: profile.accentColor ?? '',
    banner:
      profile.bannerMediaId === null ? undefined : { mediaId: profile.bannerMediaId, url: '' },
  };
}

/** Exported for `auth.mapper.ts`'s embedded-actor summary (B-129: the nameplate must reach
 * feeds/threads/search, which all serialize actors through that mapper). */
export function toProtoNameplate(nameplate: NameplateSummary): ProtoNameplate {
  return {
    nameColor: nameplate.nameColor,
    glyph: nameplate.glyph,
    badges: [...nameplate.badges],
    avatarFrame: nameplate.avatarFrame,
    statusLine: nameplate.statusLine,
    profileBorder: nameplate.profileBorder,
  };
}
