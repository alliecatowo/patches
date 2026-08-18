import type { Actor as ActorEntity } from '@patches/database';

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

export interface ActorProfile {
  id: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
  locationText: string | null;
  websiteUrl: string | null;
  isLocal: boolean;
  joinedAt: Date;
  counts: ActorCountsSummary;
}

export function toActorProfile(actor: ActorEntity, counts: ActorCountsSummary): ActorProfile {
  return {
    id: actor.id,
    handle: actor.handle,
    displayName: actor.displayName,
    bio: actor.bio,
    locationText: actor.locationText,
    websiteUrl: actor.websiteUrl,
    isLocal: actor.isLocal,
    joinedAt: actor.createdAt,
    counts,
  };
}
