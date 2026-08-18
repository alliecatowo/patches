import { Actor } from './actor.entity.js';
import { AppMeta } from './app-meta.entity.js';
import { AuthCode } from './auth-code.entity.js';
import { Credential } from './credential.entity.js';
import { Invite } from './invite.entity.js';
import { Media } from './media.entity.js';
import { OutboxJob } from './outbox-job.entity.js';
import { Post } from './post.entity.js';
import { PostMedia } from './post-media.entity.js';
import { SshLoginChallenge } from './ssh-login-challenge.entity.js';
import { RefreshToken } from './refresh-token.entity.js';
import { User } from './user.entity.js';

/**
 * Every entity in the schema, imported explicitly (not globbed) so the same array works
 * identically from TS source (CLI, tests) and from the built dist (ESM + CJS). Phase 3
 * appends the social-graph tables (`follows`, `blocks`, `mutes`, `likes`, `bookmarks`,
 * `notifications`, `reports`, `admin_audit_log`; see `docs/architecture/data-model.md`).
 */
export const ALL_ENTITIES = [
  AppMeta,
  Actor,
  User,
  RefreshToken,
  Credential,
  AuthCode,
  SshLoginChallenge,
  Invite,
  OutboxJob,
  Media,
  Post,
  PostMedia,
] as const;
