export { createDataSource, createDataSourceOptions } from './data-source.js';
export type { CreateDataSourceOptionsInput } from './data-source.js';

export { SnakeNamingStrategy } from './naming/snake-naming.strategy.js';

export { ALL_ENTITIES } from './entities/index.js';
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

export {
  AUTH_CODE_PURPOSES,
  CREDENTIAL_TYPES,
  FOLLOW_STATUSES,
  MEDIA_STATES,
  OUTBOX_JOB_STATUSES,
  POST_TYPES,
  POST_VISIBILITIES,
  USER_STATUSES,
} from './entities/enums.js';
export type {
  AuthCodePurpose,
  CredentialType,
  FollowStatus,
  MediaState,
  OutboxJobStatus,
  PostType,
  PostVisibility,
  UserStatus,
} from './entities/enums.js';

export { ALL_MIGRATIONS } from './migrations/index.js';
export { CreateAppMeta1755400000000 } from './migrations/1755400000000-CreateAppMeta.js';
export { Phase1Schema1787036506325 } from './migrations/1787036506325-Phase1Schema.js';
export { Phase3SocialGraph1787055340075 } from './migrations/1787055340075-Phase3SocialGraph.js';

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
