/**
 * Hand-maintained mirrors of proto3 enum values, for the ESM `@patches/proto` entry point
 * (`index.ts`) to export as runtime values without pulling `@nestjs/microservices` in.
 *
 * Every ts-proto `nestJs=true` generated file (`generated/patches/v1/*.ts`) unconditionally
 * imports `GrpcMethod`/`GrpcStreamMethod` from `@nestjs/microservices` for its controller
 * decorators (confirmed by inspecting `dist/index.js` after a build): exporting even a
 * single *value* — not just a type — from one of those files pulls that import along with
 * it, defeating the "importing the root never drags Nest in" guarantee documented in
 * `index.ts`/`tsup.config.ts`. Enum *types* are unaffected — `export type` is erased at
 * compile time — only enum *values* need this workaround.
 *
 * Each mirror's exact value set is asserted equal to the corresponding generated enum by
 * `enums.test.ts`, so this can never silently drift from the `.proto` source of truth. The
 * `as PostTypeT` casts are safe: `stringEnums=true` (buf.gen.yaml) makes every generated
 * enum member's runtime value identical to its own name, so these string literals and the
 * generated enum are wire-identical — the cast just restates that fact for the type checker.
 */
import type { AppealStatus as AppealStatusT } from './generated/patches/v1/appeals.js';
import type {
  CredentialType as CredentialTypeT,
  DeviceLinkStatus as DeviceLinkStatusT,
  GitHubLoginStatus as GitHubLoginStatusT,
  OidcLoginStatus as OidcLoginStatusT,
  PasswordAuthMode as PasswordAuthModeT,
} from './generated/patches/v1/auth.js';
import type {
  CommunityInviteStatus as CommunityInviteStatusT,
  CommunityRole as CommunityRoleT,
} from './generated/patches/v1/communities.js';
import type {
  FilterAction as FilterActionT,
  FilterScope as FilterScopeT,
  FilterTermKind as FilterTermKindT,
} from './generated/patches/v1/filters.js';
import type { LabelAction as LabelActionT } from './generated/patches/v1/labels.js';
import type { MediaStatus as MediaStatusT } from './generated/patches/v1/media.js';
import type { ConversationKind as ConversationKindT } from './generated/patches/v1/messages.js';
import type {
  ModerationActionType as ModerationActionTypeT,
  ModerationLogSubjectKind as ModerationLogSubjectKindT,
  ModerationReasonCategory as ModerationReasonCategoryT,
  ReportReason as ReportReasonT,
} from './generated/patches/v1/moderation.js';
import type {
  DomainPolicyAction as DomainPolicyActionT,
  FederationStance as FederationStanceT,
  RegistrationMode as RegistrationModeT,
} from './generated/patches/v1/node.js';
import type { NotificationType as NotificationTypeT } from './generated/patches/v1/notifications.js';
import type {
  FilteredByProvenance as FilteredByProvenanceT,
  PostType as PostTypeT,
  PostVisibility as PostVisibilityT,
  QuotePolicy as QuotePolicyT,
} from './generated/patches/v1/posts.js';
import type { AccountExportStatus as AccountExportStatusT } from './generated/patches/v1/privacy.js';
import type { FollowState as FollowStateT } from './generated/patches/v1/social_graph.js';

export const POST_TYPE = {
  UNSPECIFIED: 'POST_TYPE_UNSPECIFIED' as PostTypeT,
  NOTE: 'POST_TYPE_NOTE' as PostTypeT,
  LINK: 'POST_TYPE_LINK' as PostTypeT,
} as const;

export const POST_VISIBILITY = {
  UNSPECIFIED: 'POST_VISIBILITY_UNSPECIFIED' as PostVisibilityT,
  PUBLIC: 'POST_VISIBILITY_PUBLIC' as PostVisibilityT,
  UNLISTED: 'POST_VISIBILITY_UNLISTED' as PostVisibilityT,
  FOLLOWERS: 'POST_VISIBILITY_FOLLOWERS' as PostVisibilityT,
} as const;

export const CREDENTIAL_TYPE = {
  UNSPECIFIED: 'CREDENTIAL_TYPE_UNSPECIFIED' as CredentialTypeT,
  PASSWORD: 'CREDENTIAL_TYPE_PASSWORD' as CredentialTypeT,
  SSH_PUBLIC_KEY: 'CREDENTIAL_TYPE_SSH_PUBLIC_KEY' as CredentialTypeT,
  GITHUB: 'CREDENTIAL_TYPE_GITHUB' as CredentialTypeT,
  RECOVERY_CODE: 'CREDENTIAL_TYPE_RECOVERY_CODE' as CredentialTypeT,
  PASSKEY: 'CREDENTIAL_TYPE_PASSKEY' as CredentialTypeT,
  OIDC: 'CREDENTIAL_TYPE_OIDC' as CredentialTypeT,
} as const;

export const GITHUB_LOGIN_STATUS = {
  UNSPECIFIED: 'GIT_HUB_LOGIN_STATUS_UNSPECIFIED' as GitHubLoginStatusT,
  PENDING: 'GIT_HUB_LOGIN_STATUS_PENDING' as GitHubLoginStatusT,
  SLOW_DOWN: 'GIT_HUB_LOGIN_STATUS_SLOW_DOWN' as GitHubLoginStatusT,
  EXPIRED: 'GIT_HUB_LOGIN_STATUS_EXPIRED' as GitHubLoginStatusT,
  DENIED: 'GIT_HUB_LOGIN_STATUS_DENIED' as GitHubLoginStatusT,
  COMPLETE: 'GIT_HUB_LOGIN_STATUS_COMPLETE' as GitHubLoginStatusT,
} as const;

export const DEVICE_LINK_STATUS = {
  UNSPECIFIED: 'DEVICE_LINK_STATUS_UNSPECIFIED' as DeviceLinkStatusT,
  PENDING: 'DEVICE_LINK_STATUS_PENDING' as DeviceLinkStatusT,
  SLOW_DOWN: 'DEVICE_LINK_STATUS_SLOW_DOWN' as DeviceLinkStatusT,
  EXPIRED: 'DEVICE_LINK_STATUS_EXPIRED' as DeviceLinkStatusT,
  COMPLETE: 'DEVICE_LINK_STATUS_COMPLETE' as DeviceLinkStatusT,
} as const;

export const OIDC_LOGIN_STATUS = {
  UNSPECIFIED: 'OIDC_LOGIN_STATUS_UNSPECIFIED' as OidcLoginStatusT,
  PENDING: 'OIDC_LOGIN_STATUS_PENDING' as OidcLoginStatusT,
  SLOW_DOWN: 'OIDC_LOGIN_STATUS_SLOW_DOWN' as OidcLoginStatusT,
  EXPIRED: 'OIDC_LOGIN_STATUS_EXPIRED' as OidcLoginStatusT,
  DENIED: 'OIDC_LOGIN_STATUS_DENIED' as OidcLoginStatusT,
  COMPLETE: 'OIDC_LOGIN_STATUS_COMPLETE' as OidcLoginStatusT,
} as const;

export const FOLLOW_STATE = {
  UNSPECIFIED: 'FOLLOW_STATE_UNSPECIFIED' as FollowStateT,
  NONE: 'FOLLOW_STATE_NONE' as FollowStateT,
  PENDING: 'FOLLOW_STATE_PENDING' as FollowStateT,
  FOLLOWING: 'FOLLOW_STATE_FOLLOWING' as FollowStateT,
} as const;

export const PASSWORD_AUTH_MODE = {
  UNSPECIFIED: 'PASSWORD_AUTH_MODE_UNSPECIFIED' as PasswordAuthModeT,
  OFF: 'PASSWORD_AUTH_MODE_OFF' as PasswordAuthModeT,
  OPTIONAL: 'PASSWORD_AUTH_MODE_OPTIONAL' as PasswordAuthModeT,
  REQUIRED: 'PASSWORD_AUTH_MODE_REQUIRED' as PasswordAuthModeT,
} as const;

export const REGISTRATION_MODE = {
  UNSPECIFIED: 'REGISTRATION_MODE_UNSPECIFIED' as RegistrationModeT,
  OPEN: 'REGISTRATION_MODE_OPEN' as RegistrationModeT,
  INVITE_ONLY: 'REGISTRATION_MODE_INVITE_ONLY' as RegistrationModeT,
} as const;

export const NOTIFICATION_TYPE = {
  UNSPECIFIED: 'NOTIFICATION_TYPE_UNSPECIFIED' as NotificationTypeT,
  FOLLOW: 'NOTIFICATION_TYPE_FOLLOW' as NotificationTypeT,
  LIKE: 'NOTIFICATION_TYPE_LIKE' as NotificationTypeT,
  REPLY: 'NOTIFICATION_TYPE_REPLY' as NotificationTypeT,
  MENTION: 'NOTIFICATION_TYPE_MENTION' as NotificationTypeT,
  MODERATION: 'NOTIFICATION_TYPE_MODERATION' as NotificationTypeT,
  REPOST: 'NOTIFICATION_TYPE_REPOST' as NotificationTypeT,
  QUOTE: 'NOTIFICATION_TYPE_QUOTE' as NotificationTypeT,
  MESSAGE: 'NOTIFICATION_TYPE_MESSAGE' as NotificationTypeT,
  COMMUNITY_INVITE: 'NOTIFICATION_TYPE_COMMUNITY_INVITE' as NotificationTypeT,
  FOLLOW_REQUEST: 'NOTIFICATION_TYPE_FOLLOW_REQUEST' as NotificationTypeT,
  SECURITY: 'NOTIFICATION_TYPE_SECURITY' as NotificationTypeT,
} as const;

export const REPORT_REASON = {
  UNSPECIFIED: 'REPORT_REASON_UNSPECIFIED' as ReportReasonT,
  SPAM: 'REPORT_REASON_SPAM' as ReportReasonT,
  HARASSMENT: 'REPORT_REASON_HARASSMENT' as ReportReasonT,
  HATE_SPEECH: 'REPORT_REASON_HATE_SPEECH' as ReportReasonT,
  ILLEGAL_CONTENT: 'REPORT_REASON_ILLEGAL_CONTENT' as ReportReasonT,
  IMPERSONATION: 'REPORT_REASON_IMPERSONATION' as ReportReasonT,
  OTHER: 'REPORT_REASON_OTHER' as ReportReasonT,
} as const;

export const MEDIA_STATUS = {
  UNSPECIFIED: 'MEDIA_STATUS_UNSPECIFIED' as MediaStatusT,
  PENDING: 'MEDIA_STATUS_PENDING' as MediaStatusT,
  PROCESSING: 'MEDIA_STATUS_PROCESSING' as MediaStatusT,
  READY: 'MEDIA_STATUS_READY' as MediaStatusT,
  FAILED: 'MEDIA_STATUS_FAILED' as MediaStatusT,
} as const;

export const QUOTE_POLICY = {
  UNSPECIFIED: 'QUOTE_POLICY_UNSPECIFIED' as QuotePolicyT,
  ANYONE: 'QUOTE_POLICY_ANYONE' as QuotePolicyT,
  FOLLOWERS: 'QUOTE_POLICY_FOLLOWERS' as QuotePolicyT,
  NOBODY: 'QUOTE_POLICY_NOBODY' as QuotePolicyT,
} as const;

export const COMMUNITY_ROLE = {
  UNSPECIFIED: 'COMMUNITY_ROLE_UNSPECIFIED' as CommunityRoleT,
  MEMBER: 'COMMUNITY_ROLE_MEMBER' as CommunityRoleT,
  MODERATOR: 'COMMUNITY_ROLE_MODERATOR' as CommunityRoleT,
} as const;

export const COMMUNITY_INVITE_STATUS = {
  UNSPECIFIED: 'COMMUNITY_INVITE_STATUS_UNSPECIFIED' as CommunityInviteStatusT,
  PENDING: 'COMMUNITY_INVITE_STATUS_PENDING' as CommunityInviteStatusT,
  ACCEPTED: 'COMMUNITY_INVITE_STATUS_ACCEPTED' as CommunityInviteStatusT,
  DECLINED: 'COMMUNITY_INVITE_STATUS_DECLINED' as CommunityInviteStatusT,
} as const;

export const CONVERSATION_KIND = {
  UNSPECIFIED: 'CONVERSATION_KIND_UNSPECIFIED' as ConversationKindT,
  DIRECT: 'CONVERSATION_KIND_DIRECT' as ConversationKindT,
  GROUP: 'CONVERSATION_KIND_GROUP' as ConversationKindT,
} as const;

export const FILTER_TERM_KIND = {
  UNSPECIFIED: 'FILTER_TERM_KIND_UNSPECIFIED' as FilterTermKindT,
  SUBSTRING: 'FILTER_TERM_KIND_SUBSTRING' as FilterTermKindT,
  WORD: 'FILTER_TERM_KIND_WORD' as FilterTermKindT,
  TAG: 'FILTER_TERM_KIND_TAG' as FilterTermKindT,
  ACTOR: 'FILTER_TERM_KIND_ACTOR' as FilterTermKindT,
  DOMAIN: 'FILTER_TERM_KIND_DOMAIN' as FilterTermKindT,
} as const;

export const FILTER_SCOPE = {
  UNSPECIFIED: 'FILTER_SCOPE_UNSPECIFIED' as FilterScopeT,
  HOME: 'FILTER_SCOPE_HOME' as FilterScopeT,
  LOCAL: 'FILTER_SCOPE_LOCAL' as FilterScopeT,
  TAG_FEED: 'FILTER_SCOPE_TAG_FEED' as FilterScopeT,
  COMMUNITY_FEED: 'FILTER_SCOPE_COMMUNITY_FEED' as FilterScopeT,
  NOTIFICATIONS: 'FILTER_SCOPE_NOTIFICATIONS' as FilterScopeT,
  SEARCH: 'FILTER_SCOPE_SEARCH' as FilterScopeT,
} as const;

export const FILTER_ACTION = {
  UNSPECIFIED: 'FILTER_ACTION_UNSPECIFIED' as FilterActionT,
  HIDE: 'FILTER_ACTION_HIDE' as FilterActionT,
  COLLAPSE: 'FILTER_ACTION_COLLAPSE' as FilterActionT,
  WARN: 'FILTER_ACTION_WARN' as FilterActionT,
} as const;

export const LABEL_ACTION = {
  UNSPECIFIED: 'LABEL_ACTION_UNSPECIFIED' as LabelActionT,
  IGNORE: 'LABEL_ACTION_IGNORE' as LabelActionT,
  WARN: 'LABEL_ACTION_WARN' as LabelActionT,
  COLLAPSE: 'LABEL_ACTION_COLLAPSE' as LabelActionT,
  HIDE: 'LABEL_ACTION_HIDE' as LabelActionT,
} as const;

export const APPEAL_STATUS = {
  UNSPECIFIED: 'APPEAL_STATUS_UNSPECIFIED' as AppealStatusT,
  OPEN: 'APPEAL_STATUS_OPEN' as AppealStatusT,
  UPHELD: 'APPEAL_STATUS_UPHELD' as AppealStatusT,
  OVERTURNED: 'APPEAL_STATUS_OVERTURNED' as AppealStatusT,
  MODIFIED: 'APPEAL_STATUS_MODIFIED' as AppealStatusT,
} as const;

export const ACCOUNT_EXPORT_STATUS = {
  UNSPECIFIED: 'ACCOUNT_EXPORT_STATUS_UNSPECIFIED' as AccountExportStatusT,
  PENDING: 'ACCOUNT_EXPORT_STATUS_PENDING' as AccountExportStatusT,
  READY: 'ACCOUNT_EXPORT_STATUS_READY' as AccountExportStatusT,
  FAILED: 'ACCOUNT_EXPORT_STATUS_FAILED' as AccountExportStatusT,
  EXPIRED: 'ACCOUNT_EXPORT_STATUS_EXPIRED' as AccountExportStatusT,
} as const;

export const FEDERATION_STANCE = {
  UNSPECIFIED: 'FEDERATION_STANCE_UNSPECIFIED' as FederationStanceT,
  DISABLED: 'FEDERATION_STANCE_DISABLED' as FederationStanceT,
  ALLOWLIST: 'FEDERATION_STANCE_ALLOWLIST' as FederationStanceT,
  OPEN_WITH_BLOCKLIST: 'FEDERATION_STANCE_OPEN_WITH_BLOCKLIST' as FederationStanceT,
} as const;

export const DOMAIN_POLICY_ACTION = {
  UNSPECIFIED: 'DOMAIN_POLICY_ACTION_UNSPECIFIED' as DomainPolicyActionT,
  BLOCK: 'DOMAIN_POLICY_ACTION_BLOCK' as DomainPolicyActionT,
} as const;

export const MODERATION_REASON_CATEGORY = {
  UNSPECIFIED: 'MODERATION_REASON_CATEGORY_UNSPECIFIED' as ModerationReasonCategoryT,
  HARASSMENT: 'MODERATION_REASON_CATEGORY_HARASSMENT' as ModerationReasonCategoryT,
  HATE: 'MODERATION_REASON_CATEGORY_HATE' as ModerationReasonCategoryT,
  THREATS: 'MODERATION_REASON_CATEGORY_THREATS' as ModerationReasonCategoryT,
  DOXXING: 'MODERATION_REASON_CATEGORY_DOXXING' as ModerationReasonCategoryT,
  IMPERSONATION: 'MODERATION_REASON_CATEGORY_IMPERSONATION' as ModerationReasonCategoryT,
  SPAM: 'MODERATION_REASON_CATEGORY_SPAM' as ModerationReasonCategoryT,
  ILLEGAL_CONTENT: 'MODERATION_REASON_CATEGORY_ILLEGAL_CONTENT' as ModerationReasonCategoryT,
  NCII: 'MODERATION_REASON_CATEGORY_NCII' as ModerationReasonCategoryT,
  INFRASTRUCTURE_ABUSE:
    'MODERATION_REASON_CATEGORY_INFRASTRUCTURE_ABUSE' as ModerationReasonCategoryT,
  OTHER: 'MODERATION_REASON_CATEGORY_OTHER' as ModerationReasonCategoryT,
} as const;

export const MODERATION_ACTION_TYPE = {
  UNSPECIFIED: 'MODERATION_ACTION_TYPE_UNSPECIFIED' as ModerationActionTypeT,
  WARN: 'MODERATION_ACTION_TYPE_WARN' as ModerationActionTypeT,
  SUSPEND: 'MODERATION_ACTION_TYPE_SUSPEND' as ModerationActionTypeT,
  BAN: 'MODERATION_ACTION_TYPE_BAN' as ModerationActionTypeT,
  POST_REMOVAL: 'MODERATION_ACTION_TYPE_POST_REMOVAL' as ModerationActionTypeT,
  MEDIA_TAKEDOWN: 'MODERATION_ACTION_TYPE_MEDIA_TAKEDOWN' as ModerationActionTypeT,
  DOMAIN_BLOCK: 'MODERATION_ACTION_TYPE_DOMAIN_BLOCK' as ModerationActionTypeT,
} as const;

export const MODERATION_LOG_SUBJECT_KIND = {
  UNSPECIFIED: 'MODERATION_LOG_SUBJECT_KIND_UNSPECIFIED' as ModerationLogSubjectKindT,
  DOMAIN: 'MODERATION_LOG_SUBJECT_KIND_DOMAIN' as ModerationLogSubjectKindT,
  ACCOUNT: 'MODERATION_LOG_SUBJECT_KIND_ACCOUNT' as ModerationLogSubjectKindT,
  POST: 'MODERATION_LOG_SUBJECT_KIND_POST' as ModerationLogSubjectKindT,
  MEDIA: 'MODERATION_LOG_SUBJECT_KIND_MEDIA' as ModerationLogSubjectKindT,
} as const;

export const FILTERED_BY_PROVENANCE = {
  UNSPECIFIED: 'FILTERED_BY_PROVENANCE_UNSPECIFIED' as FilteredByProvenanceT,
  FILTER: 'FILTERED_BY_PROVENANCE_FILTER' as FilteredByProvenanceT,
  FILTER_LIST: 'FILTERED_BY_PROVENANCE_FILTER_LIST' as FilteredByProvenanceT,
} as const;
