import type { CredentialType as DbCredentialType } from '@patches/database';
import { dateToTimestamp } from '@patches/proto';
import type { Actor, Credential, Session } from '@patches/proto';
import { CredentialType } from '@patches/proto/nest';

import type { ActorSummary, CredentialSummary, SessionEnvelope } from './auth.dto.js';

/**
 * Application DTO → protobuf message (spec §128).
 *
 * Field-by-field on purpose, never a spread: a spread is how a column nobody meant to expose
 * ends up on the wire the day someone adds one (§153).
 */

/** `PASSKEY` is reserved in the database enum but is not a v0 protobuf value (§165), so it
 * maps to UNSPECIFIED rather than being invented on the wire. */
const CREDENTIAL_TYPE_TO_PROTO: Readonly<Record<DbCredentialType, CredentialType>> = Object.freeze({
  PASSWORD: CredentialType.CREDENTIAL_TYPE_PASSWORD,
  SSH_PUBLIC_KEY: CredentialType.CREDENTIAL_TYPE_SSH_PUBLIC_KEY,
  GITHUB: CredentialType.CREDENTIAL_TYPE_GITHUB,
  PASSKEY: CredentialType.CREDENTIAL_TYPE_UNSPECIFIED,
});

/** Deliberately narrower than `DbCredentialType`: no protobuf value maps to `PASSKEY`. */
export type AddableCredentialType = Extract<
  DbCredentialType,
  'PASSWORD' | 'SSH_PUBLIC_KEY' | 'GITHUB'
>;

const PROTO_TO_CREDENTIAL_TYPE: Readonly<Partial<Record<CredentialType, AddableCredentialType>>> =
  Object.freeze({
    [CredentialType.CREDENTIAL_TYPE_PASSWORD]: 'PASSWORD',
    [CredentialType.CREDENTIAL_TYPE_SSH_PUBLIC_KEY]: 'SSH_PUBLIC_KEY',
    [CredentialType.CREDENTIAL_TYPE_GITHUB]: 'GITHUB',
  });

/** `undefined` for UNSPECIFIED/UNRECOGNIZED and for GITHUB, which `AddCredential` refuses. */
export function credentialTypeFromProto(value: CredentialType): AddableCredentialType | undefined {
  return PROTO_TO_CREDENTIAL_TYPE[value];
}

/**
 * `counts`, `avatar` and `nameplate` are left unset rather than zeroed/empty: this is the
 * caller's own actor as seen by the auth surface, and `ActorService` owns the social/identity
 * projection. A zeroed `counts` would assert "no followers" where the truth is "not loaded".
 */
export function toProtoActor(actor: ActorSummary): Actor {
  return {
    id: actor.id,
    handle: actor.handle,
    displayName: actor.displayName ?? '',
    bio: actor.bio ?? '',
    locationText: actor.locationText ?? '',
    websiteUrl: actor.websiteUrl ?? '',
    avatar: undefined,
    isLocal: actor.isLocal,
    joinedAt: dateToTimestamp(actor.joinedAt),
    counts: undefined,
    nameplate: undefined,
  };
}

export function toProtoCredential(credential: CredentialSummary): Credential {
  return {
    id: credential.id,
    type: CREDENTIAL_TYPE_TO_PROTO[credential.type],
    label: credential.label ?? '',
    // Null for PASSWORD; the empty string is protobuf's only way to say "absent" for a scalar.
    identifier: credential.identifier ?? '',
    createdAt: dateToTimestamp(credential.createdAt),
    lastUsedAt: credential.lastUsedAt === null ? undefined : dateToTimestamp(credential.lastUsedAt),
  };
}

/** The single session envelope every login method returns (`docs/architecture/auth.md` §2). */
export function toProtoSession(session: SessionEnvelope): Session {
  return {
    accessToken: session.tokens.accessToken,
    accessExpiresAt: dateToTimestamp(session.tokens.accessExpiresAt),
    refreshToken: session.tokens.refreshToken,
    refreshExpiresAt: dateToTimestamp(session.tokens.refreshExpiresAt),
    actor: toProtoActor(session.actor),
    emailVerified: session.emailVerified,
    node: session.node,
  };
}
