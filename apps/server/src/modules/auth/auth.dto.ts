import type {
  Actor as ActorEntity,
  Credential as CredentialEntity,
  CredentialType,
} from '@patches/database';

import { toNameplateSummary, type NameplateSummary } from '../actors/actor.dto.js';
import type { IssuedTokens } from './token.service.js';

/**
 * The application layer's own vocabulary (spec §128–§129).
 *
 * `AuthService` returns these, never TypeORM entities: an entity carries `secret_hash` and
 * every other column, and once one reaches a controller the only thing standing between it
 * and the wire is somebody remembering not to spread it. These types simply do not have the
 * fields that must not leave the server (§153, §165).
 */

export interface ActorSummary {
  id: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
  locationText: string | null;
  websiteUrl: string | null;
  isLocal: boolean;
  joinedAt: Date;
  /** `null` for a local actor (spec §163) — the mapper turns this into the wire's empty
   * string, same convention as `PostSummary`'s `originServer`. */
  homeServer: string | null;
  /** The actor's presentation, when customized (B-129: nameplates must render wherever a
   * name appears, feeds included — the column is always loaded, so this costs no extra
   * query). Null means "never customized", same as `ActorProfile.nameplate`. */
  nameplate: NameplateSummary | null;
}

export interface SessionEnvelope {
  tokens: IssuedTokens;
  actor: ActorSummary;
  emailVerified: boolean;
  /** Canonical domain of the issuing node (§163, §169). */
  node: string;
}

export interface CurrentSessionSummary {
  userId: string;
  sessionId: string;
  actor: ActorSummary;
  expiresAt: Date;
  emailVerified: boolean;
  node: string;
}

/** Note the absence of `secretHash`, `publicMaterial` and `metadata` (§165, §177). */
export interface CredentialSummary {
  id: string;
  type: CredentialType;
  label: string | null;
  identifier: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export function toActorSummary(actor: ActorEntity): ActorSummary {
  return {
    id: actor.id,
    handle: actor.handle,
    displayName: actor.displayName,
    bio: actor.bio,
    locationText: actor.locationText,
    websiteUrl: actor.websiteUrl,
    isLocal: actor.isLocal,
    joinedAt: actor.createdAt,
    homeServer: actor.homeServer,
    nameplate: toNameplateSummary(actor.nameplate),
  };
}

export function toCredentialSummary(credential: CredentialEntity): CredentialSummary {
  return {
    id: credential.id,
    type: credential.type,
    label: credential.label,
    identifier: credential.identifier,
    createdAt: credential.createdAt,
    lastUsedAt: credential.lastUsedAt,
  };
}
