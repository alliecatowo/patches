import { Actor } from './actor.entity.js';
import { AdminAuditLog } from './admin-audit-log.entity.js';
import { AppMeta } from './app-meta.entity.js';
import { AuthCode } from './auth-code.entity.js';
import { Block } from './block.entity.js';
import { Bookmark } from './bookmark.entity.js';
import { Credential } from './credential.entity.js';
import { DomainBlock } from './domain-block.entity.js';
import { FederationKey } from './federation-key.entity.js';
import { Follow } from './follow.entity.js';
import { GuestbookEntry } from './guestbook-entry.entity.js';
import { InboxActivity } from './inbox-activity.entity.js';
import { Invite } from './invite.entity.js';
import { Like } from './like.entity.js';
import { Media } from './media.entity.js';
import { Mute } from './mute.entity.js';
import { Notification } from './notification.entity.js';
import { OutboxJob } from './outbox-job.entity.js';
import { Page } from './page.entity.js';
import { PageAsset } from './page-asset.entity.js';
import { PageRevision } from './page-revision.entity.js';
import { Post } from './post.entity.js';
import { PostMedia } from './post-media.entity.js';
import { RateLimitBucket } from './rate-limit-bucket.entity.js';
import { Report } from './report.entity.js';
import { SshLoginChallenge } from './ssh-login-challenge.entity.js';
import { RefreshToken } from './refresh-token.entity.js';
import { User } from './user.entity.js';

/**
 * Every entity in the schema, imported explicitly (not globbed) so the same array works
 * identically from TS source (CLI, tests) and from the built dist (ESM + CJS). Phase 3 added
 * the social-graph tables (`follows`, `blocks`, `mutes`); Phase 4/6 add `likes`, `bookmarks`,
 * `notifications`, `reports` (see `docs/architecture/data-model.md`); Phase 6 also adds
 * `admin_audit_log` and `rate_limit_buckets` (§65–66, A-018); Phase 4.5 adds the Patches
 * Pages tables — `pages`, `page_revisions`, `page_assets`, `guestbook_entries` (§170-172).
 * Phase 8 adds the federation lab tables — `federation_keys`, `inbox_activities`,
 * `domain_blocks` (§105-110, `docs/architecture/federation.md`).
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
  AdminAuditLog,
  RateLimitBucket,
  Page,
  PageRevision,
  PageAsset,
  GuestbookEntry,
  FederationKey,
  InboxActivity,
  DomainBlock,
] as const;
