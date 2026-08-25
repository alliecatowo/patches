import { Actor } from './actor.entity.js';
import { AccountDeletionRequest } from './account-deletion-request.entity.js';
import { AccountExport } from './account-export.entity.js';
import { ActorFlair } from './actor-flair.entity.js';
import { ActorPrivacyPrefs } from './actor-privacy-prefs.entity.js';
import { AdminAuditLog } from './admin-audit-log.entity.js';
import { Appeal } from './appeal.entity.js';
import { AppMeta } from './app-meta.entity.js';
import { AuthCode } from './auth-code.entity.js';
import { Block } from './block.entity.js';
import { Bookmark } from './bookmark.entity.js';
import { Community } from './community.entity.js';
import { CommunityBan } from './community-ban.entity.js';
import { CommunityInvite } from './community-invite.entity.js';
import { CommunityMember } from './community-member.entity.js';
import { Conversation } from './conversation.entity.js';
import { ConversationMember } from './conversation-member.entity.js';
import { Credential } from './credential.entity.js';
import { DomainBlock } from './domain-block.entity.js';
import { E2eeDeviceIdentity } from './e2ee-device-identity.entity.js';
import { E2eeDeviceRoster } from './e2ee-device-roster.entity.js';
import { E2eeGroupControlEvent } from './e2ee-group-control-event.entity.js';
import { E2eeIdentityRoot } from './e2ee-identity-root.entity.js';
import { E2eeLogicalMessage } from './e2ee-logical-message.entity.js';
import { E2eeMailboxEnvelope } from './e2ee-mailbox-envelope.entity.js';
import { E2eeNodeFrankingKey } from './e2ee-node-franking-key.entity.js';
import { E2eeOneTimePrekey } from './e2ee-one-time-prekey.entity.js';
import { E2eeReportEvidenceItem } from './e2ee-report-evidence-item.entity.js';
import { E2eeReportEvidence } from './e2ee-report-evidence.entity.js';
import { E2eeSignedPrekey } from './e2ee-signed-prekey.entity.js';
import { FederationKey } from './federation-key.entity.js';
import { Filter } from './filter.entity.js';
import { FilterList } from './filter-list.entity.js';
import { FilterListEntry } from './filter-list-entry.entity.js';
import { FilterListException } from './filter-list-exception.entity.js';
import { FilterListSubscription } from './filter-list-subscription.entity.js';
import { FilterScope } from './filter-scope.entity.js';
import { FilterTerm } from './filter-term.entity.js';
import { Follow } from './follow.entity.js';
import { FollowRequest } from './follow-request.entity.js';
import { GuestbookEntry } from './guestbook-entry.entity.js';
import { InboxActivity } from './inbox-activity.entity.js';
import { Invite } from './invite.entity.js';
import { Label } from './label.entity.js';
import { Labeler } from './labeler.entity.js';
import { LabelerSubscription } from './labeler-subscription.entity.js';
import { LabelerSubscriptionAction } from './labeler-subscription-action.entity.js';
import { Like } from './like.entity.js';
import { Media } from './media.entity.js';
import { ModerationLogEntry } from './moderation-log-entry.entity.js';
import { Mute } from './mute.entity.js';
import { Notification } from './notification.entity.js';
import { OutboxJob } from './outbox-job.entity.js';
import { Page } from './page.entity.js';
import { PageAsset } from './page-asset.entity.js';
import { PageRevision } from './page-revision.entity.js';
import { PinnedPost } from './pinned-post.entity.js';
import { Post } from './post.entity.js';
import { PostEdit } from './post-edit.entity.js';
import { PostMedia } from './post-media.entity.js';
import { PostTag } from './post-tag.entity.js';
import { QuoteAuthorization } from './quote-authorization.entity.js';
import { RateLimitBucket } from './rate-limit-bucket.entity.js';
import { Report } from './report.entity.js';
import { Repost } from './repost.entity.js';
import { SshLoginChallenge } from './ssh-login-challenge.entity.js';
import { Tag } from './tag.entity.js';
import { TagMute } from './tag-mute.entity.js';
import { RefreshToken } from './refresh-token.entity.js';
import { User } from './user.entity.js';
import { WebauthnChallenge } from './webauthn-challenge.entity.js';

/**
 * Every entity in the schema, imported explicitly (not globbed) so the same array works
 * identically from TS source (CLI, tests) and from the built dist (ESM + CJS). Phase 3 added
 * the social-graph tables (`follows`, `blocks`, `mutes`); Phase 4/6 add `likes`, `bookmarks`,
 * `notifications`, `reports` (see `docs/architecture/data-model.md`); Phase 6 also adds
 * `admin_audit_log` and `rate_limit_buckets` (§65–66, A-018); Phase 4.5 adds the Patches
 * Pages tables — `pages`, `page_revisions`, `page_assets`, `guestbook_entries` (§170-172).
 * Phase 8 adds the federation lab tables — `federation_keys`, `inbox_activities`,
 * `domain_blocks` (§105-110, `docs/architecture/federation.md`). Phase 11 (Amendment B,
 * §188-190) adds `reposts`, `tags`, `post_tags`, `tag_mutes`, `communities`,
 * `community_members`, `community_bans`, `community_invites`, `conversations`,
 * `conversation_members`, `messages`, `message_requests`, `post_edits`, `pinned_posts`,
 * `actor_flair`. Phase 13 adds only public E2EE identity/prekey material, opaque mailbox
 * envelopes, and explicitly consented report evidence. Phase 18 adds
 * `quote_authorizations` (ADR 0028 FEP-044f evidence lifecycle; `reposts` itself gains
 * `remote_activity_uri` in place).
 */
export const ALL_ENTITIES = [
  AppMeta,
  Actor,
  User,
  RefreshToken,
  Credential,
  AuthCode,
  SshLoginChallenge,
  WebauthnChallenge,
  Invite,
  OutboxJob,
  Media,
  Post,
  PostMedia,
  Follow,
  FollowRequest,
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
  Repost,
  QuoteAuthorization,
  Tag,
  PostTag,
  TagMute,
  Community,
  CommunityMember,
  CommunityBan,
  CommunityInvite,
  Conversation,
  ConversationMember,
  E2eeIdentityRoot,
  E2eeDeviceIdentity,
  E2eeDeviceRoster,
  E2eeSignedPrekey,
  E2eeOneTimePrekey,
  E2eeLogicalMessage,
  E2eeMailboxEnvelope,
  E2eeGroupControlEvent,
  E2eeReportEvidence,
  E2eeReportEvidenceItem,
  E2eeNodeFrankingKey,
  PostEdit,
  PinnedPost,
  ActorFlair,
  ActorPrivacyPrefs,
  Filter,
  FilterScope,
  FilterTerm,
  FilterList,
  FilterListEntry,
  FilterListSubscription,
  FilterListException,
  Labeler,
  Label,
  LabelerSubscription,
  LabelerSubscriptionAction,
  Appeal,
  ModerationLogEntry,
  AccountDeletionRequest,
  AccountExport,
] as const;
