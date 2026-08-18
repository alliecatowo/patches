export { createDataSource, createDataSourceOptions } from './data-source.js';
export type { CreateDataSourceOptionsInput } from './data-source.js';

export { SnakeNamingStrategy } from './naming/snake-naming.strategy.js';

export { ALL_ENTITIES } from './entities/index.js';
export { AdminAuditLog } from './entities/admin-audit-log.entity.js';
export { RateLimitBucket } from './entities/rate-limit-bucket.entity.js';
export { AppMeta } from './entities/app-meta.entity.js';
export { Actor } from './entities/actor.entity.js';
export { User } from './entities/user.entity.js';
export { RefreshToken } from './entities/refresh-token.entity.js';
export { AuthCode } from './entities/auth-code.entity.js';
export { SshLoginChallenge } from './entities/ssh-login-challenge.entity.js';
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

export {
  ADMIN_AUDIT_SUBJECT_TYPES,
  AUTH_CODE_PURPOSES,
  CREDENTIAL_TYPES,
  FOLLOW_STATUSES,
  MEDIA_STATES,
  NOTIFICATION_TYPES,
  OUTBOX_JOB_STATUSES,
  POST_TYPES,
  POST_VISIBILITIES,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_SUBJECT_TYPES,
  USER_STATUSES,
} from './entities/enums.js';
export type {
  AdminAuditSubjectType,
  AuthCodePurpose,
  CredentialType,
  FollowStatus,
  MediaState,
  NotificationType,
  OutboxJobStatus,
  PostType,
  PostVisibility,
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

export {
  claimOutboxJobs,
  markOutboxJobFailed,
  markOutboxJobSucceeded,
  outboxBackoffDelayMs,
  DEFAULT_OUTBOX_BACKOFF,
} from './repositories/outbox.js';
export type { ClaimOutboxJobsOptions, OutboxBackoffOptions } from './repositories/outbox.js';

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
} from './jobs/payloads.js';
