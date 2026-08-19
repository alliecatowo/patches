export { createDataSource, createDataSourceOptions } from './data-source.js';
export type { CreateDataSourceOptionsInput } from './data-source.js';

export { SnakeNamingStrategy } from './naming/snake-naming.strategy.js';

export {
  decryptFederationPrivateKeyPem,
  encryptFederationPrivateKeyPem,
} from './crypto/federation-key-cipher.js';
export type { EncryptedFederationPrivateKey } from './crypto/federation-key-cipher.js';

export { ALL_ENTITIES } from './entities/index.js';
export { AdminAuditLog } from './entities/admin-audit-log.entity.js';
export { RateLimitBucket } from './entities/rate-limit-bucket.entity.js';
export { AppMeta } from './entities/app-meta.entity.js';
export { Actor } from './entities/actor.entity.js';
export { User } from './entities/user.entity.js';
export { RefreshToken } from './entities/refresh-token.entity.js';
export { AuthCode } from './entities/auth-code.entity.js';
export {
  SshLoginChallenge,
  SSH_LOGIN_CHALLENGE_PURPOSES,
} from './entities/ssh-login-challenge.entity.js';
export type { SshLoginChallengePurpose } from './entities/ssh-login-challenge.entity.js';
export { Credential } from './entities/credential.entity.js';
export { Invite } from './entities/invite.entity.js';
export { OutboxJob } from './entities/outbox-job.entity.js';
export { Media } from './entities/media.entity.js';
export { Post } from './entities/post.entity.js';
export { PostMedia, MAX_POST_MEDIA } from './entities/post-media.entity.js';
export { Follow } from './entities/follow.entity.js';
export { Block } from './entities/block.entity.js';
export { Mute } from './entities/mute.entity.js';
export { Like } from './entities/like.entity.js';
export { Bookmark } from './entities/bookmark.entity.js';
export { Notification } from './entities/notification.entity.js';
export { Report } from './entities/report.entity.js';
export { Page } from './entities/page.entity.js';
export { PageRevision } from './entities/page-revision.entity.js';
export { PageAsset } from './entities/page-asset.entity.js';
export { GuestbookEntry } from './entities/guestbook-entry.entity.js';
export { FederationKey } from './entities/federation-key.entity.js';
export { InboxActivity } from './entities/inbox-activity.entity.js';
export { DomainBlock } from './entities/domain-block.entity.js';
export { Repost } from './entities/repost.entity.js';
export { Tag } from './entities/tag.entity.js';
export { PostTag } from './entities/post-tag.entity.js';
export { TagMute } from './entities/tag-mute.entity.js';
export { Community } from './entities/community.entity.js';
export { CommunityMember } from './entities/community-member.entity.js';
export { CommunityBan } from './entities/community-ban.entity.js';
export { CommunityInvite } from './entities/community-invite.entity.js';
export { Conversation } from './entities/conversation.entity.js';
export { ConversationMember } from './entities/conversation-member.entity.js';
export { Message } from './entities/message.entity.js';
export { MessageRequest } from './entities/message-request.entity.js';
export { PostEdit } from './entities/post-edit.entity.js';
export { PinnedPost } from './entities/pinned-post.entity.js';
export { ActorFlair } from './entities/actor-flair.entity.js';

export {
  ADMIN_AUDIT_SUBJECT_TYPES,
  AUTH_CODE_PURPOSES,
  COMMUNITY_INVITE_STATUSES,
  COMMUNITY_ROLES,
  CONVERSATION_KINDS,
  CREDENTIAL_TYPES,
  FOLLOW_STATUSES,
  MEDIA_STATES,
  MESSAGE_REQUEST_STATUSES,
  NOTIFICATION_TYPES,
  OUTBOX_JOB_STATUSES,
  PAGE_VISIBILITIES,
  POST_TYPES,
  POST_VISIBILITIES,
  QUOTE_POLICIES,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_SUBJECT_TYPES,
  USER_STATUSES,
} from './entities/enums.js';
export type {
  AdminAuditSubjectType,
  AuthCodePurpose,
  CommunityInviteStatus,
  CommunityRole,
  ConversationKind,
  CredentialType,
  FollowStatus,
  MediaState,
  MessageRequestStatus,
  NotificationType,
  OutboxJobStatus,
  PageVisibility,
  PostType,
  PostVisibility,
  QuotePolicy,
  ReportReason,
  ReportStatus,
  ReportSubjectType,
  UserStatus,
} from './entities/enums.js';

export { ALL_MIGRATIONS } from './migrations/index.js';
export { CreateAppMeta1755400000000 } from './migrations/1755400000000-CreateAppMeta.js';
export { Phase1Schema1787036506325 } from './migrations/1787036506325-Phase1Schema.js';
export { Phase3SocialGraph1787055340075 } from './migrations/1787055340075-Phase3SocialGraph.js';
export { Phase4Interactions1787058326261 } from './migrations/1787058326261-Phase4Interactions.js';
export { ActorRegistrationIdempotency1787059787165 } from './migrations/1787059787165-ActorRegistrationIdempotency.js';
export { Phase6Admin1787062075716 } from './migrations/1787062075716-Phase6Admin.js';
export { Phase45Pages1787062912872 } from './migrations/1787062912872-Phase45Pages.js';
export { Phase8Federation1787076396680 } from './migrations/1787076396680-Phase8Federation.js';
export { Phase9Hardening1787082699518 } from './migrations/1787082699518-Phase9Hardening.js';
export { Phase11SocialDepth1787103400432 } from './migrations/1787103400432-Phase11SocialDepth.js';

export {
  claimOutboxJobs,
  markOutboxJobFailed,
  markOutboxJobSucceeded,
  outboxBackoffDelayMs,
  replayOutboxJob,
  DEFAULT_OUTBOX_BACKOFF,
} from './repositories/outbox.js';
export type { ClaimOutboxJobsOptions, OutboxBackoffOptions } from './repositories/outbox.js';

export { appendAdminAuditLog } from './repositories/admin-audit.js';
export type { AppendAdminAuditLogInput } from './repositories/admin-audit.js';

export { runMigrationsForTests } from './testing/run-migrations-for-tests.js';

export { JOB_TYPES, type JobType } from './jobs/job-types.js';
export {
  sendVerificationEmailPayloadSchema,
  type SendVerificationEmailPayload,
  sendPasswordResetEmailPayloadSchema,
  type SendPasswordResetEmailPayload,
  processMediaPayloadSchema,
  type ProcessMediaPayload,
  cleanExpiredTokensPayloadSchema,
  type CleanExpiredTokensPayload,
  cleanExpiredUploadsPayloadSchema,
  type CleanExpiredUploadsPayload,
  federationDeliverPayloadSchema,
  type FederationDeliverPayload,
} from './jobs/payloads.js';
