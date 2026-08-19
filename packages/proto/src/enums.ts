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
import type {
  CredentialType as CredentialTypeT,
  GitHubLoginStatus as GitHubLoginStatusT,
} from './generated/patches/v1/auth.js';
import type {
  CommunityInviteStatus as CommunityInviteStatusT,
  CommunityRole as CommunityRoleT,
} from './generated/patches/v1/communities.js';
import type { MediaStatus as MediaStatusT } from './generated/patches/v1/media.js';
import type {
  ConversationKind as ConversationKindT,
  MessageRequestStatus as MessageRequestStatusT,
} from './generated/patches/v1/messages.js';
import type { ReportReason as ReportReasonT } from './generated/patches/v1/moderation.js';
import type { RegistrationMode as RegistrationModeT } from './generated/patches/v1/node.js';
import type { NotificationType as NotificationTypeT } from './generated/patches/v1/notifications.js';
import type {
  PostType as PostTypeT,
  PostVisibility as PostVisibilityT,
  QuotePolicy as QuotePolicyT,
} from './generated/patches/v1/posts.js';
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
} as const;

export const GITHUB_LOGIN_STATUS = {
  UNSPECIFIED: 'GIT_HUB_LOGIN_STATUS_UNSPECIFIED' as GitHubLoginStatusT,
  PENDING: 'GIT_HUB_LOGIN_STATUS_PENDING' as GitHubLoginStatusT,
  SLOW_DOWN: 'GIT_HUB_LOGIN_STATUS_SLOW_DOWN' as GitHubLoginStatusT,
  EXPIRED: 'GIT_HUB_LOGIN_STATUS_EXPIRED' as GitHubLoginStatusT,
  DENIED: 'GIT_HUB_LOGIN_STATUS_DENIED' as GitHubLoginStatusT,
  COMPLETE: 'GIT_HUB_LOGIN_STATUS_COMPLETE' as GitHubLoginStatusT,
} as const;

export const FOLLOW_STATE = {
  UNSPECIFIED: 'FOLLOW_STATE_UNSPECIFIED' as FollowStateT,
  NONE: 'FOLLOW_STATE_NONE' as FollowStateT,
  PENDING: 'FOLLOW_STATE_PENDING' as FollowStateT,
  FOLLOWING: 'FOLLOW_STATE_FOLLOWING' as FollowStateT,
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

export const MESSAGE_REQUEST_STATUS = {
  UNSPECIFIED: 'MESSAGE_REQUEST_STATUS_UNSPECIFIED' as MessageRequestStatusT,
  PENDING: 'MESSAGE_REQUEST_STATUS_PENDING' as MessageRequestStatusT,
  ACCEPTED: 'MESSAGE_REQUEST_STATUS_ACCEPTED' as MessageRequestStatusT,
  DECLINED: 'MESSAGE_REQUEST_STATUS_DECLINED' as MessageRequestStatusT,
} as const;
