import type { Actor as ActorEntity } from '@patches/database';

import {
  PROFILE_FRAMES,
  NAME_TAG_STYLES,
  type ProfileFrameValue,
  type NameTagStyleValue,
} from './validation.js';

/**
 * `ActorService`'s own vocabulary (spec §128–129) — never an `Actor` entity past this layer.
 * Distinct from `auth.dto.ts`'s `ActorSummary`: that one is deliberately counts-less (an
 * embedded reference), this one is the full profile `GetActor`/`GetActorByHandle` guarantee.
 */

export interface ActorCountsSummary {
  followers: number;
  following: number;
  posts: number;
}

/**
 * Server-side view of `actors.nameplate` (spec §173). `badges` is present here (it is real
 * data an actor has) but is never *writable* through `UpdateProfileInput` — see
 * `ActorService.updateProfile`'s nameplate handling, which always keeps the actor's existing
 * badges regardless of what the caller sent.
 */
export interface NameplateSummary {
  nameColor: string;
  glyph: string;
  badges: string[];
  avatarFrame: string;
  statusLine: string;
  profileBorder: string;
}

export interface ActorProfile {
  id: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
  locationText: string | null;
  websiteUrl: string | null;
  isLocal: boolean;
  /** `null` for a local actor (spec §163) — the mapper turns this into the wire's empty
   * string, same convention `Post.originServer` uses. */
  homeServer: string | null;
  joinedAt: Date;
  counts: ActorCountsSummary;
  /** `null` when the actor has never customized their presentation (spec §173). */
  nameplate: NameplateSummary | null;
  flair: { document: string; updatedAt: Date } | null;
  pinnedPostIds: string[];
  /** Rapid personalization (owner request 2026-08-25) — `null` = unset. */
  profileBannerUrl: string | null;
  profileFrame: ProfileFrameValue | null;
  nameTagStyle: NameTagStyleValue | null;
  accentColor: string | null;
  /** Direct-to-R2 uploaded avatar/banner media ids (#324) — `null` = unset. */
  avatarMediaId: string | null;
  bannerMediaId: string | null;
}

export function toActorProfile(
  actor: ActorEntity,
  counts: ActorCountsSummary,
  extras: {
    flair?: { document: unknown; updatedAt: Date } | null;
    pinnedPostIds?: readonly string[];
  } = {},
): ActorProfile {
  return {
    id: actor.id,
    handle: actor.handle,
    displayName: actor.displayName,
    bio: actor.bio,
    locationText: actor.locationText,
    websiteUrl: actor.websiteUrl,
    isLocal: actor.isLocal,
    homeServer: actor.homeServer,
    joinedAt: actor.createdAt,
    counts,
    nameplate: toNameplateSummary(actor.nameplate),
    flair:
      extras.flair === null || extras.flair === undefined
        ? null
        : { document: JSON.stringify(extras.flair.document), updatedAt: extras.flair.updatedAt },
    pinnedPostIds: [...(extras.pinnedPostIds ?? [])].slice(0, 3),
    profileBannerUrl: actor.profileBannerUrl,
    // Defensive, same reasoning as `toNameplateSummary` below: a hand-edited or
    // future-schema row degrades to "unset" rather than 500-ing the profile read.
    profileFrame: profileFrameOf(actor.profileFrame),
    nameTagStyle: nameTagStyleOf(actor.nameTagStyle),
    accentColor: actor.accentColor,
    avatarMediaId: actor.avatarMediaId,
    bannerMediaId: actor.bannerMediaId,
  };
}

function profileFrameOf(raw: string | null): ProfileFrameValue | null {
  return (PROFILE_FRAMES as readonly string[]).includes(raw ?? '')
    ? (raw as ProfileFrameValue)
    : null;
}

function nameTagStyleOf(raw: string | null): NameTagStyleValue | null {
  return (NAME_TAG_STYLES as readonly string[]).includes(raw ?? '')
    ? (raw as NameTagStyleValue)
    : null;
}

/**
 * The `nameplate` column is untyped `jsonb` at the database layer (`Record<string, unknown> |
 * null`) — this is the one place that trusts its shape, defaulting any field that isn't the
 * type it should be rather than throwing, so a hand-edited or future-schema row degrades to
 * "field absent" instead of a 500. Exported because the embedded-actor summary
 * (`auth.dto.ts`'s `ActorSummary`, B-129: nameplates must render in feeds) reuses it.
 */
export function toNameplateSummary(
  raw: Record<string, unknown> | null | undefined,
): NameplateSummary | null {
  if (raw === null || raw === undefined) return null;
  const string = (value: unknown): string => (typeof value === 'string' ? value : '');
  const stringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

  return {
    nameColor: string(raw.nameColor),
    glyph: string(raw.glyph),
    badges: stringArray(raw.badges),
    avatarFrame: string(raw.avatarFrame),
    statusLine: string(raw.statusLine),
    profileBorder: string(raw.profileBorder),
  };
}
