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

export {
  AccountExportStatus as ACCOUNT_EXPORT_STATUS,
  AppealStatus as APPEAL_STATUS,
  CommunityInviteStatus as COMMUNITY_INVITE_STATUS,
  CommunityRole as COMMUNITY_ROLE,
  ConversationKind as CONVERSATION_KIND,
  ConversationSecurityMode as CONVERSATION_SECURITY_MODE,
  CredentialType as CREDENTIAL_TYPE,
  DomainPolicyAction as DOMAIN_POLICY_ACTION,
  FederationStance as FEDERATION_STANCE,
  FilterAction as FILTER_ACTION,
  FilterScope as FILTER_SCOPE,
  FilterTermKind as FILTER_TERM_KIND,
  FilteredByProvenance as FILTERED_BY_PROVENANCE,
  FollowState as FOLLOW_STATE,
  GitHubLoginStatus as GITHUB_LOGIN_STATUS,
  LabelAction as LABEL_ACTION,
  MediaStatus as MEDIA_STATUS,
  MessageRequestStatus as MESSAGE_REQUEST_STATUS,
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
