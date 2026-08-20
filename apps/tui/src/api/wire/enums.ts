/**
 * Wire enum seam (ADR 0023 slice 4).
 *
 * The single place `apps/tui/src` names generated protobuf **enum values**. Every
 * consumer imports enum mirrors from here instead of from `@patches/proto` directly, so
 * the slice 7 flip to `@patches/proto/es` is a one-file edit instead of a ~45-file edit.
 *
 * `packages/proto/src/enums.ts`'s mirrors are prefix-stripped (`POST_TYPE.NOTE`) and
 * identical to protoc-gen-es's own member names (`PostType.NOTE`), so the flip only ever
 * changes this file's re-export source, never a call site.
 *
 * Timestamp helpers and message/request/response types are not part of this seam yet
 * (ADR 0023 slices 3 and 5) - those still import `@patches/proto` directly or via
 * `wire/types.ts`.
 */

export {
  ACCOUNT_EXPORT_STATUS,
  APPEAL_STATUS,
  COMMUNITY_INVITE_STATUS,
  COMMUNITY_ROLE,
  CONVERSATION_KIND,
  CREDENTIAL_TYPE,
  DOMAIN_POLICY_ACTION,
  FEDERATION_STANCE,
  FILTER_ACTION,
  FILTER_SCOPE,
  FILTER_TERM_KIND,
  FILTERED_BY_PROVENANCE,
  FOLLOW_STATE,
  GITHUB_LOGIN_STATUS,
  LABEL_ACTION,
  MEDIA_STATUS,
  MESSAGE_REQUEST_STATUS,
  MODERATION_ACTION_TYPE,
  MODERATION_LOG_SUBJECT_KIND,
  MODERATION_REASON_CATEGORY,
  NOTIFICATION_TYPE,
  OIDC_LOGIN_STATUS,
  PASSWORD_AUTH_MODE,
  POST_TYPE,
  POST_VISIBILITY,
  QUOTE_POLICY,
  REGISTRATION_MODE,
  REPORT_REASON,
} from '@patches/proto';
