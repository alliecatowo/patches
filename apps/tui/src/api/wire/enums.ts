/**
 * Wire enum seam (ADR 0023 slice 4, flipped in slice 7/P10-013).
 *
 * The single place `apps/tui/src` names generated protobuf **enum values**. Every
 * consumer imports enum mirrors from here instead of from `@patches/proto/es` directly.
 *
 * protoc-gen-es emits a real numeric TS `enum` per proto enum, named after the enum
 * itself (`PostType`) with the `POST_TYPE_` prefix stripped from each member
 * (`PostType.NOTE`) — exactly the convention `packages/proto/src/enums.ts`'s
 * hand-written ts-proto mirrors already used (`POST_TYPE.NOTE`). So the flip below is a
 * rename of the import (`PostType as POST_TYPE`), never a call site
 * (`POST_TYPE.NOTE` reads identically either way, ADR 0023 §"three things measured").
 *
 * Timestamp helpers and message/request/response types are not part of this seam —
 * see `wire/time.ts` and `wire/types.ts`.
 */

import { enumToJson, type DescEnum } from '@bufbuild/protobuf';

export {
  AccountExportStatus as ACCOUNT_EXPORT_STATUS,
  AppealStatus as APPEAL_STATUS,
  CommunityInviteStatus as COMMUNITY_INVITE_STATUS,
  CommunityRole as COMMUNITY_ROLE,
  ConversationKind as CONVERSATION_KIND,
  ConversationSecurityMode as CONVERSATION_SECURITY_MODE,
  CredentialType as CREDENTIAL_TYPE,
  DomainPolicyAction as DOMAIN_POLICY_ACTION,
  E2eeCapabilityState as E2EE_CAPABILITY_STATE,
  E2eeDeviceStatus as E2EE_DEVICE_STATUS,
  E2eeGroupChangeKind as E2EE_GROUP_CHANGE_KIND,
  FederationStance as FEDERATION_STANCE,
  FilterAction as FILTER_ACTION,
  FilterScope as FILTER_SCOPE,
  FilterTermKind as FILTER_TERM_KIND,
  FilteredByProvenance as FILTERED_BY_PROVENANCE,
  FollowState as FOLLOW_STATE,
  GitHubLoginStatus as GITHUB_LOGIN_STATUS,
  LabelAction as LABEL_ACTION,
  MediaStatus as MEDIA_STATUS,
  ModerationActionType as MODERATION_ACTION_TYPE,
  ModerationLogSubjectKind as MODERATION_LOG_SUBJECT_KIND,
  ModerationReasonCategory as MODERATION_REASON_CATEGORY,
  NotificationType as NOTIFICATION_TYPE,
  OidcLoginStatus as OIDC_LOGIN_STATUS,
  PasswordAuthMode as PASSWORD_AUTH_MODE,
  PostType as POST_TYPE,
  PostVisibility as POST_VISIBILITY,
  QuotePolicy as QUOTE_POLICY,
  RegistrationMode as REGISTRATION_MODE,
  ReportReason as REPORT_REASON,
} from '@patches/proto/es';

/**
 * Rendering an enum is the one place the two proto families are *not* interchangeable, and it is
 * invisible to the typechecker because both sides have the same TS enum type.
 *
 * ts-proto's enums are string-valued, so `${appeal.status}` printed `APPEAL_STATUS_OPEN`.
 * protoc-gen-es's are numeric, so the same interpolation prints `1`. Every call site that puts an
 * enum in front of a user has to go through this helper instead (P10-020, ADR 0023 addendum).
 *
 * `enumToJson` reads the generated descriptor, so the name it returns is the proto wire name —
 * byte-identical to what ts-proto used to interpolate.
 */
export function enumWireName(schema: DescEnum, value: number): string {
  const name = enumToJson(schema, value);
  // `enumToJson` returns the number back when the value is not in the descriptor, which happens
  // for a field a newer server populated with an enum member this client was not built against.
  // Printing the number is the honest fallback; it is what the wire actually carried.
  return typeof name === 'string' ? name : String(value);
}

export {
  AppealStatusSchema as APPEAL_STATUS_SCHEMA,
  CredentialTypeSchema as CREDENTIAL_TYPE_SCHEMA,
  E2eeDeviceStatusSchema as E2EE_DEVICE_STATUS_SCHEMA,
  FilterActionSchema as FILTER_ACTION_SCHEMA,
} from '@patches/proto/es';
