import type { CredentialType as DbCredentialType } from '@patches/database';
import { dateToTimestamp } from '@patches/proto';
import type { Actor, Credential, OidcProviderInfo, Session } from '@patches/proto';
import {
  CredentialType,
  DeviceLinkStatus,
  GitHubLoginStatus,
  OidcLoginStatus,
  PasswordAuthMode,
} from '@patches/proto/nest';

import type { ActorSummary, CredentialSummary, SessionEnvelope } from './auth.dto.js';
import type {
  DeviceLinkPollResult,
  GitHubLoginPollResult,
  OidcLoginPollResult,
  OidcProviderPolicy,
} from './auth.service.js';

/**
 * Application DTO → protobuf message (spec §128).
 *
 * Field-by-field on purpose, never a spread: a spread is how a column nobody meant to expose
 * ends up on the wire the day someone adds one (§153).
 */

const CREDENTIAL_TYPE_TO_PROTO: Readonly<Record<DbCredentialType, CredentialType>> = Object.freeze({
  PASSWORD: CredentialType.CREDENTIAL_TYPE_PASSWORD,
  SSH_PUBLIC_KEY: CredentialType.CREDENTIAL_TYPE_SSH_PUBLIC_KEY,
  GITHUB: CredentialType.CREDENTIAL_TYPE_GITHUB,
  PASSKEY: CredentialType.CREDENTIAL_TYPE_PASSKEY,
  RECOVERY_CODE: CredentialType.CREDENTIAL_TYPE_RECOVERY_CODE,
  OIDC: CredentialType.CREDENTIAL_TYPE_OIDC,
});

/** P15-002: `AppConfigService.passwordAuthMode`'s three string values → the wire enum. */
const PASSWORD_AUTH_MODE_TO_PROTO: Readonly<
  Record<'off' | 'optional' | 'required', PasswordAuthMode>
> = Object.freeze({
  off: PasswordAuthMode.PASSWORD_AUTH_MODE_OFF,
  optional: PasswordAuthMode.PASSWORD_AUTH_MODE_OPTIONAL,
  required: PasswordAuthMode.PASSWORD_AUTH_MODE_REQUIRED,
});

export function toProtoPasswordAuthMode(mode: 'off' | 'optional' | 'required'): PasswordAuthMode {
  return PASSWORD_AUTH_MODE_TO_PROTO[mode];
}

/** Deliberately narrower than `DbCredentialType`: `PASSKEY` is enrolled through its own
 * `BeginPasskeyRegistration`/`CompletePasskeyRegistration` pair (P15-004), never through the
 * generic `AddCredential`, so it has no place in this map even though it now has a protobuf
 * value ({@link CREDENTIAL_TYPE_TO_PROTO}). */
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
    // Same "not loaded here" reasoning as `counts`/`nameplate` above (P11-001).
    flair: undefined,
    pinnedPostIds: [],
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

const GITHUB_LOGIN_STATUS_TO_PROTO: Readonly<
  Record<GitHubLoginPollResult['status'], GitHubLoginStatus>
> = Object.freeze({
  PENDING: GitHubLoginStatus.GIT_HUB_LOGIN_STATUS_PENDING,
  SLOW_DOWN: GitHubLoginStatus.GIT_HUB_LOGIN_STATUS_SLOW_DOWN,
  EXPIRED: GitHubLoginStatus.GIT_HUB_LOGIN_STATUS_EXPIRED,
  DENIED: GitHubLoginStatus.GIT_HUB_LOGIN_STATUS_DENIED,
  COMPLETE: GitHubLoginStatus.GIT_HUB_LOGIN_STATUS_COMPLETE,
});

export function toProtoGitHubLoginStatus(
  status: GitHubLoginPollResult['status'],
): GitHubLoginStatus {
  return GITHUB_LOGIN_STATUS_TO_PROTO[status];
}

const OIDC_LOGIN_STATUS_TO_PROTO: Readonly<Record<OidcLoginPollResult['status'], OidcLoginStatus>> =
  Object.freeze({
    PENDING: OidcLoginStatus.OIDC_LOGIN_STATUS_PENDING,
    SLOW_DOWN: OidcLoginStatus.OIDC_LOGIN_STATUS_SLOW_DOWN,
    EXPIRED: OidcLoginStatus.OIDC_LOGIN_STATUS_EXPIRED,
    DENIED: OidcLoginStatus.OIDC_LOGIN_STATUS_DENIED,
    COMPLETE: OidcLoginStatus.OIDC_LOGIN_STATUS_COMPLETE,
  });

export function toProtoOidcLoginStatus(status: OidcLoginPollResult['status']): OidcLoginStatus {
  return OIDC_LOGIN_STATUS_TO_PROTO[status];
}

const DEVICE_LINK_STATUS_TO_PROTO: Readonly<
  Record<DeviceLinkPollResult['status'], DeviceLinkStatus>
> = Object.freeze({
  PENDING: DeviceLinkStatus.DEVICE_LINK_STATUS_PENDING,
  SLOW_DOWN: DeviceLinkStatus.DEVICE_LINK_STATUS_SLOW_DOWN,
  EXPIRED: DeviceLinkStatus.DEVICE_LINK_STATUS_EXPIRED,
  COMPLETE: DeviceLinkStatus.DEVICE_LINK_STATUS_COMPLETE,
});

export function toProtoDeviceLinkStatus(status: DeviceLinkPollResult['status']): DeviceLinkStatus {
  return DEVICE_LINK_STATUS_TO_PROTO[status];
}

/** P15-006: `AuthPolicy.oidcProviders` → the wire `repeated OidcProviderInfo` — id and display
 * name only, never the client id/secret/URLs (those never leave `AppConfigService`). */
export function toProtoOidcProviders(providers: readonly OidcProviderPolicy[]): OidcProviderInfo[] {
  return providers.map((provider) => ({ id: provider.id, displayName: provider.displayName }));
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
