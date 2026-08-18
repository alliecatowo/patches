import { Actor } from './actor.entity.js';
import { AppMeta } from './app-meta.entity.js';
import { AuthCode } from './auth-code.entity.js';
import { Block } from './block.entity.js';
import { Bookmark } from './bookmark.entity.js';
import { Credential } from './credential.entity.js';
import { Follow } from './follow.entity.js';
import { Invite } from './invite.entity.js';
import { Like } from './like.entity.js';
import { Media } from './media.entity.js';
import { Mute } from './mute.entity.js';
import { Notification } from './notification.entity.js';
import { OutboxJob } from './outbox-job.entity.js';
import { Post } from './post.entity.js';
import { PostMedia } from './post-media.entity.js';
import { Report } from './report.entity.js';
import { SshLoginChallenge } from './ssh-login-challenge.entity.js';
import { RefreshToken } from './refresh-token.entity.js';
import { User } from './user.entity.js';

/**
 * Every entity in the schema, imported explicitly (not globbed) so the same array works
 * identically from TS source (CLI, tests) and from the built dist (ESM + CJS). Phase 3 added
 * the social-graph tables (`follows`, `blocks`, `mutes`); Phase 4/6 add `likes`, `bookmarks`,
 * `notifications`, `reports` (see `docs/architecture/data-model.md`). `admin_audit_log`
 * remains planned.
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
  Follow,
  Block,
  Mute,
  Like,
  Bookmark,
  Notification,
  Report,
] as const;
