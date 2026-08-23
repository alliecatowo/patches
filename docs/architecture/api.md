# API contract: Protobuf / gRPC

Patches' canonical client/server application protocol — the contract between a client and a
**node**. Source of truth: `INITIAL_VISION.md` §40–58, §83, and **Amendment A §168, §170,
§174**.

> **Amendment A changed this document.** `AuthService` gains SSH, GitHub-device-flow, and
> credential-management RPCs (§168); a `NodeService` and a `PageService` are added. See
> [`auth.md`](./auth.md) and [`pages.md`](./pages.md).

**Implementation status.** `packages/proto/proto/patches/v1/` currently defines
`common.proto`, `system.proto`, `auth.proto`, `actors.proto`, `posts.proto`, `feeds.proto`,
`social_graph.proto`, `node.proto`, `pages.proto`, `media.proto`, `reactions.proto`,
`moderation.proto`, `notifications.proto`, `tags.proto`, `communities.proto`,
`messages.proto`, `filters.proto`, `filter_lists.proto`, `labels.proto`, `appeals.proto`, and
`privacy.proto` — the full `AuthService` (including SSH login,
GitHub device-flow login, and credential management) has server handlers, `BeginGitHubLogin`/
`PollGitHubLogin` included as of P6-005 (§176, §167). `PostService`
(`CreatePost`/`GetPost`/`DeletePost`/`ListReplies` — `ListReplies` is a cursor-paginated,
bounded-depth breadth-first walk, not just direct replies; `CreatePost` also accepts
`content_warning`, B-018) and `ActorService` (`GetActor`/`GetActorByHandle`/`UpdateProfile` —
including a bounded `nameplate`, §173 — `SearchActors`, `ListFollowers`, `ListFollowing`,
`ResolveActor` (B-028)) have server handlers, all implemented by P3-001 except `ResolveActor`
(B-028). `SocialGraphService` (`social_graph.proto`) has server handlers for
`FollowActor`/`UnfollowActor`/`GetRelationship`/`ListMutualFollows` (B-024); `MuteActor`/
`UnmuteActor`/`BlockActor`/`UnblockActor` are implemented, but on `ModerationService` rather
than `SocialGraphService` (Phase 6, P6-001/P6-002) — the `blocks`/`mutes` tables (P3-001) are
read by the feed/relationship queries and written by `ModerationService`. `FeedService`'s
`ListLocalFeed`/`ListActorPosts`/`ListHomeFeed` all have server handlers (P3-002) with
keyset-paginated, visibility+block+mute-aware SQL (§59, §62–63) — see §3's `FeedService` table
for the exact scoping. `NodeService.GetNodeInfo` (`node.proto`) has a server handler (P1-014).
`PageService` (`pages.proto`, Phase 4.5) has server handlers for every RPC —
`GetPage`/`UpdatePage`/`ListPageRevisions`/`ListGuestbook`/`SignGuestbook`/
`RemoveGuestbookEntry`/`ReportGuestbookEntry` — as of P45-003. `MediaService`
(`BeginMediaUpload`/`FinalizeMediaUpload`/`GetMediaDownload`, backed by a presigned R2/MinIO
PUT plus a worker `PROCESS_MEDIA` job producing Sharp derivatives, ADR 0015), `ReactionService`
(`LikePost`/`UnlikePost`/`BookmarkPost`/`UnbookmarkPost`/`ListBookmarks`/`ListPostLikers`,
P4-002), `ModerationService`
(`BlockActor`/`UnblockActor`/`MuteActor`/`UnmuteActor`/`ListBlocks`/`ListMutes`/`ReportPost`/
`ReportActor`/`ReportMessage`, P6-001/P6-002/P11-004), and `NotificationService`
(`ListNotifications`/`MarkNotificationsRead`/`GetUnreadCount`, P4-003) are all implemented,
with server handlers in `packages/proto` and `apps/server`. Phase 11 adds implemented tag,
community, direct-message, repost/quote/edit/pin, social-feed, flair, and node-capability
surfaces. Per-RPC status is called out inline below.

## 1. Schema layout

Protocol Buffers, proto3, package `patches.v1`:

```text
packages/proto/proto/patches/v1/
├── common.proto     # implemented
├── system.proto     # implemented
├── auth.proto       # implemented
├── node.proto       # implemented (GetNodeInfo only)
├── users.proto       # planned — no separate `users.proto` is currently expected;
│                       # actor-facing user data flows through auth.proto's Session/GetCurrentSession
├── actors.proto      # implemented
├── pages.proto       # implemented (P45-003)
├── posts.proto       # implemented
├── feeds.proto       # implemented
├── social_graph.proto # implemented (FollowActor/UnfollowActor/GetRelationship/ListMutualFollows/ListFollowRequests/AcceptFollowRequest/RejectFollowRequest)
├── media.proto       # implemented (Phase 5)
├── moderation.proto  # implemented (P6-001/P6-002)
├── reactions.proto   # implemented (P4-002)
├── tags.proto        # implemented (P11-005)
├── communities.proto # implemented (P11-003)
├── messages.proto    # implemented (P11-004)
├── notifications.proto  # implemented (P4-003)
├── filters.proto     # implemented (P14-007)
├── filter_lists.proto # implemented (P14-008)
├── labels.proto      # implemented (P14-009)
├── appeals.proto     # implemented (P14-011)
└── privacy.proto     # implemented (P14-010)
```

```proto
package patches.v1;
```

Generation pipeline: `.proto` files are canonical → **Buf** validates
(`format`/`lint`/`breaking`) → **ts-proto** generates compile-time TypeScript
types/interfaces → NestJS loads the `.proto` definitions through its officially
supported gRPC transport (`@grpc/grpc-js` + `@grpc/proto-loader`). Generated
TypeScript is never hand-duplicated and is clearly marked as generated (§42).

Transport: `@grpc/grpc-js` — never the deprecated native `grpc` package (§43).

## 2. Service list

One service per domain boundary — never one giant `PatchesService` (§47):

```proto
service SystemService
service AuthService
service NodeService
service PageService
service ActorService
service PostService
service FeedService
service MediaService
service SocialGraphService
service ReactionService
service NotificationService
service ModerationService
service TagService
service CommunityService
service DirectMessageService
service E2eeService  // implemented node-side; production capability DISABLED (ADR 0020)
service FilterService
service FilterListService
service LabelService
service AppealService
service PrivacyService
```

The five services above (Amendment C, §196–§210) are **implemented**, except the graduated
domain-limit tier called out in §3a below — see [§3a](#3a-amendment-c-services-196210) for what
each does and does not cover.

## 3. RPCs by service

### SystemService (§83) — implemented in `system.proto`

| RPC             | Notes                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GetServerInfo` | unauthenticated; server build version, wire protocol version, oldest client build still accepted (version compatibility, §9 below) |
| `Ping`          | unauthenticated; echoes the caller's nonce back — a cheap liveness/latency probe                                                   |

This is the permanent, always-first RPC a client calls to learn whether it can talk to the
node at all, before any auth flow. `GetServerInfo`/`Ping` are exercised by
`apps/server/test/system.integration.test.ts` and `apps/server/test/health.integration.test.ts`.

### AuthService (§48) — implemented in `auth.proto`

| RPC                    | Notes                                                                          |
| ---------------------- | ------------------------------------------------------------------------------ |
| `GetAuthPolicy`        | unauthenticated; `password_auth` (P15-002) — call before rendering password UI |
| `Register`             | invite-gated in v0; carries `privacy_notice_version_acknowledged` (§204.2)     |
| `VerifyEmail`          | consumes an `email_verification_codes` row                                     |
| `ResendVerification`   | authenticated; re-issues a fresh `email_verification_codes` row                |
| `Login`                | issues access + refresh token                                                  |
| `RefreshSession`       | rotates refresh token; reuse triggers family revocation                        |
| `Logout`               | revokes current session                                                        |
| `LogoutAllSessions`    | revokes all sessions for the user                                              |
| `RequestPasswordReset` | issues a `password_reset_codes` row                                            |
| `ResetPassword`        | consumes the reset code                                                        |
| `GetCurrentSession`    | returns session/actor info for the current access token                        |

Added by Amendment A (§168), implemented in `auth.proto`. Every login RPC returns the **same
session envelope**, so client session handling is identical regardless of credential type.
`BeginGitHubLogin`/`PollGitHubLogin` have server handlers as of P6-005 (§176); both answer
`UNIMPLEMENTED` when the node has no `GITHUB_CLIENT_ID` configured (`docs/architecture/
auth.md` §5) rather than pretending the flow works.

| RPC                           | Notes                                                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `BeginSshLogin`               | issues a single-use, TTL-bounded challenge; returned regardless of enrollment                                                     |
| `CompleteSshLogin`            | verifies the agent signature over the reconstructed blob; generic failure only                                                    |
| `BeginSshEnrollment`          | authenticated; issues a challenge to add a new SSH key to the caller's own account, verified by `AddCredential`'s signature check |
| `BeginGitHubLogin`            | device flow: returns user code, verification URI, polling interval                                                                |
| `PollGitHubLogin`             | polls GitHub; returns pending or a session envelope                                                                               |
| `ListCredentials`             | type, label, identifier, `created_at`, `last_used_at` — **never `secret_hash`**                                                   |
| `AddCredential`               | requires an authenticated session                                                                                                 |
| `RevokeCredential`            | fails if it would revoke the last active credential                                                                               |
| `GenerateRecoveryCodes`       | authenticated; mints 10 single-use codes (P15-003), revoking any generated previously                                             |
| `RecoveryLogin`               | unauthenticated; redeems one code for a session, generic failure only                                                             |
| `BeginPasskeyRegistration`    | authenticated (P15-004, ADR 0022); web-client-only, issues a WebAuthn registration challenge as opaque JSON                       |
| `CompletePasskeyRegistration` | authenticated; verifies the ceremony response, enrolls a `PASSKEY` credential                                                     |
| `BeginPasskeyLogin`           | unauthenticated, discoverable-credential (no handle/email field); issues a WebAuthn login challenge                               |
| `CompletePasskeyLogin`        | unauthenticated; verifies the ceremony response, generic failure only, same uniform posture as `CompleteSshLogin`                 |

Notes:

- `Login` is the **password** login. It must not become a polymorphic grab-bag of credential
  types.
- `Register` accepts an optional initial credential, so SSH-first registration never has to
  pass through a password.
- `VerifyEmail`, `RequestPasswordReset`, `ResetPassword` apply only to accounts with a
  verified recovery email (§165).
- Flows, the signed-blob composition, and the no-enumeration rule are in
  [`auth.md`](./auth.md).

### NodeService (§163, §168) — implemented in `node.proto` (P1-014)

| RPC             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetNodeInfo`   | **unauthenticated**; node domain, software version, registration mode, input limits (§58), and configured social capabilities (§174), including post length, community creation policy, DM availability/retention, and allowed like glyphs. `NodeLimits` also publishes the Amendment C size limits (§204, A-054) — max filters/actor, max terms/filter, max filter lists published/actor, max filter-list entries, max filter-list subscriptions, max per-entry exceptions/list, max labeler subscriptions/actor, max labeler vocabulary entries, max appeal statement chars, and max ready export archives/actor — mirroring the `@patches/domain`/module constants (`packages/domain/src/limits.ts`, `apps/server/src/modules/labels/label-validation.ts`) that already enforce each server-side, so a client can render "you have N of LIMIT" honestly instead of guessing                                                                                        |
| `GetNodePolicy` | Status: implemented (P14-012) — **unauthenticated**, cacheable, a deliberately separate RPC from `GetNodeInfo`; publishes `domain_blocks` as `domain_policies` (action `BLOCK`, published `reason_category`), the label vocabulary, `federation_stance` (explicit `FEDERATION_STANCE` env var, or derived from `FEDERATION_ENABLED` when unset), `account_deletion_grace_period_days`/`appeal_window_days`, and operator-supplied `NODE_POLICY_URL`/`NODE_MODERATORS`/`DATA_LOCATION`/`PRIVACY_NOTICE_VERSION` (`.env.example`). Fields with no configuration surface yet (`privacy_notice_summary`, `terms_url`, `appeal_instructions`, `operator_identity`) and three retention windows with no sweep job yet (`evidence_snapshot_retention_days`, `uploaded_original_retention_days`, `log_retention_days`) stay honestly empty/zero rather than invented — the proto's own contract says an unset field renders as "this node publishes no policy" for that field |

Clients discover node policy here rather than assuming the reference node's behavior. There
is no `tier`/`plan`/`premium` field anywhere in the protocol (§174, ADR 0014) — clients branch
on capabilities only.

### PageService (§170–§172) — implemented in `pages.proto` (P45-003)

**Phase 4.5.** The server stores, validates, versions and serves the page document; it never
renders it. See [`pages.md`](./pages.md) §4 for implementation notes beyond this table.

| RPC                    | Notes                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GetPage`              | by handle (+ optional slug, empty = "index"); anonymous, block-aware (§62); returns the current revision document and a convenience `theme` extract    |
| `UpdatePage`           | authenticated; always the caller's own page; validated **strictly** against the declared schema version (§171); writes a new immutable revision        |
| `ListPageRevisions`    | authenticated; the caller's own page's revision history, cursor-paginated                                                                              |
| `ListGuestbook`        | anonymous, block-aware (§62); cursor-paginated; excludes removed entries                                                                               |
| `SignGuestbook`        | authenticated; rate-limited on both peer and actor (§102); blocked-either-direction actors rejected (uniform `NOT_FOUND`, §62); plain text ≤ 500 chars |
| `RemoveGuestbookEntry` | authenticated, page owner only today (moderator removal is a documented follow-up); idempotent                                                         |
| `ReportGuestbookEntry` | authenticated; bounded report (§64), reuses `reports.subject_type = 'GUESTBOOK_ENTRY'`                                                                 |

The document is inert data — no executable user code, in any client, ever (§172). Renderers
ignore unknown block types gracefully; the server rejects them on write.

### ActorService (§49) — implemented in `actors.proto`

| RPC                | Notes                                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GetActor`         | by ID; real counts plus validated flair and up to three `pinned_post_ids`                                                                                                                                                                                                                                          |
| `GetActorByHandle` |                                                                                                                                                                                                                                                                                                                    |
| `UpdateProfile`    | `display_name`/`bio`/`location_text`/`website_url`/`nameplate`/`flair`, selected by a `google.protobuf.FieldMask`; flair is size-, color-contrast-, glyph-, border-, and theme-validated                                                                                                                           |
| `SearchActors`     | handle prefix (`LIKE`) + display-name match (`ILIKE`) (§112), keyset-paginated on `(created_at DESC, id DESC)`, newest matching actor first — not yet trigram/full-text; excludes actors with `discoverable = false` (§197.5, P14-029) — `GetActorByHandle`/`ResolveActor` are unaffected                          |
| `ListFollowers`    | cursor-paginated on the `follows` row's own `(created_at DESC, id DESC)`; `counts` left zeroed (a list summary, not `GetActor`'s guarantee)                                                                                                                                                                        |
| `ListFollowing`    | same as `ListFollowers`, opposite direction                                                                                                                                                                                                                                                                        |
| `ResolveActor`     | (B-028) discovers a remote actor by `acct:user@domain` via WebFinger (`RemoteActorService`) and upserts/returns it (`is_local = false`) so the caller can `SocialGraphService.FollowActor` it; requires an authenticated session and is rate-limited per caller; `NOT_IMPLEMENTED` when `FEDERATION_ENABLED=false` |

`UpdateProfile`'s `nameplate.badges` is never accepted from the client (§173) — the server
mapper (`actor.service.ts`'s `buildNameplateRecord`) always carries the actor's existing
badges forward regardless of what a request sends, and validates the serialized record stays
≤ 2 KiB.

### SocialGraphService (§50, §197.5) — implemented in `social_graph.proto` (P3-001, P14-010 follow-up), `FollowActor`/`UnfollowActor`/`GetRelationship`/`ListMutualFollows`/`ListFollowRequests`/`AcceptFollowRequest`/`RejectFollowRequest`

| RPC                   | Notes                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FollowActor`         | v0 local accounts transition straight to `FOLLOWING`; self-follow rejected (`VALIDATION_ERROR`); a block in either direction rejected (`ACTOR_BLOCKED` → `PERMISSION_DENIED`); idempotent. Against a **locked** local actor (§197.5), creates a pending `follow_requests` row instead (`FollowActorResponse.requested = true`), rate-limited per actor/peer |
| `UnfollowActor`       | idempotent — unfollowing a non-followed actor is not an error; also cancels a pending outgoing follow request toward the target, if any (§197.5's "cancel my request")                                                                                                                                                                                      |
| `GetRelationship`     | `state` (`NONE`/`PENDING`/`FOLLOWING`), `followed_by`, `blocking`, `muting`, `requested` (outgoing pending request), `requested_by` (incoming pending request) — all require an authenticated session                                                                                                                                                       |
| `ListMutualFollows`   | (B-024) actors `actor_id` both follows and is followed by ("friends"); self-join on `follows`, keyset-paginated on the caller-facing edge's `(created_at DESC, id DESC)`; requires a session                                                                                                                                                                |
| `ListFollowRequests`  | (§197.5) the caller's own inbound pending-request queue, keyset-paginated on `(created_at DESC, id DESC)`; requires a session — there is no one else's queue to list                                                                                                                                                                                        |
| `AcceptFollowRequest` | (§197.5) creates the `FOLLOWING` `follows` row and removes the request; `FOLLOW_REQUEST_NOT_FOUND` if none is pending; notifies the requester (`NotificationType.FOLLOW`)                                                                                                                                                                                   |
| `RejectFollowRequest` | (§197.5) discards the request, no `follows` row ever created; `FOLLOW_REQUEST_NOT_FOUND` if none is pending; does not notify the requester (same non-disclosure reasoning as blocks, §62)                                                                                                                                                                   |

`BlockActor`/`UnblockActor`/`MuteActor`/`UnmuteActor` are **not** on this service — they live on
`ModerationService` below (P6-001). `FollowActor` calls `NotificationsService.notifyFollow` on a
genuinely new follow (A-026), or `notifyFollowRequest` on a genuinely new request (§197.5),
after the follow transaction commits.

Locked-account follow requests (§197.5) live in their own `follow_requests` table
(`packages/database/src/entities/follow-request.entity.ts`), never a third `follows.status`
value — see that entity's doc comment for why conflating "awaiting a locked local actor's
approval" with the pre-existing remote-federation `PENDING` status (awaiting that actor's
node sending back `Accept`, P8-002/P8-003) would be wrong. `Relationship.state` still reports
`PENDING` for both cases; `requested`/`requested_by` disambiguate the locked-account case.
Unlocking an account never auto-accepts a request already pending against it (§197.5's
explicit rule) — see `docs/architecture/social.md`.

### PostService (§51) — implemented in `posts.proto` (P3-001, P11-006)

| RPC                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CreatePost`                 | idempotent; supports replies, community posts, quotes with server-enforced quote policy, and write-time tag extraction; triggers reply, mention, and quote notifications as applicable; gated by `RequirePrivacyAckGuard` when `REQUIRE_PRIVACY_ACK=true` (below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GetPost`                    | optional bearer token — with one, the author's own `viewer_state.liked`/`bookmarked` is filled in and a blocked-either-direction post is `POST_NOT_FOUND` (§62), same as `ListReplies`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `DeletePost`                 | soft delete / tombstone; returns the tombstoned post                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ListReplies`                | cursor-paginated, bounded-depth breadth-first walk (`max_depth`, clamped 1–6, default 4) capped at 500 total nodes per call (§24); optional bearer token filters out blocked-either-direction repliers (§62); see `PostService.listReplies`'s doc comment for why this is BFS-in-memory rather than a recursive CTE                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `EditPost` / `ListPostEdits` | body/media edits preserve immutable snapshots and never re-notify or re-order the post; structural fields remain immutable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `PinPost` / `UnpinPost`      | idempotently manages an actor's ordered pinned-post set, capped at three                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `SearchPosts`                | Status: implemented (P12; SEARCH-scope filters P14 follow-up) — Postgres full-text (`websearch_to_tsquery('simple', …)` against a GIN expression index on `to_tsvector('simple', body)`, `Phase12PostSearch` migration); strictly newest-first, keyset-paged like every other list RPC — no relevance score, never a `sort`/`order` param (§194); optional bearer token, same block/mute/`FOLLOWERS`-visibility/tag-mute/community rules as `ListLocalFeed` (reuses its exported filter helpers); optional `author_handle` filter; replies excluded unless `include_replies` is set; rejects an empty/whitespace or >200-char `query` with `INVALID_ARGUMENT`; a viewer's `SEARCH`-scope filters (§198) are applied with the same bounded-over-fetch/`MAX_FILTER_ROUNDS` pattern `FeedService#page()` uses — a `hide` match is omitted (pagination stays correct across rounds), `collapse`/`warn` populate `filtered_by`; excludes posts by an actor with `indexable = false` (§197.5, P14-029) |

`Post.counts.likes`/`viewer_state.liked`/`viewer_state.bookmarked` are real as of P4-002 (previously always zero/false) — computed by `PostService.viewOf`/`feeds/post-batch.ts`'s `toPostViews` from the `likes`/`bookmarks` tables.

`Post.filtered_by` (§198.3, P14-007/P14-008) and `Post.labels` (§200.3, P14-009) are both wired:
`feeds/post-batch.ts` populates each per post before mapping to the wire, and (P14 follow-up)
`PostService`'s single-post `viewOf` now populates `Post.labels` too — so `GetPost`, `ListReplies`,
and every other read that funnels through `viewOf` (edit/pin/quote-nesting) carry the same
subscriber-scoped labels a feed read does, not just feeds.

`RequirePrivacyAckGuard` (`apps/server/src/common/guards/require-privacy-ack.guard.ts`, P14
follow-up, spec §197.5, §197.6): an `AuthGuard` companion, attached per-method after `AuthGuard`
on a handful of write RPCs. A no-op unless the operator sets `REQUIRE_PRIVACY_ACK=true`
(default false — most nodes publish no privacy notice, `NODE_POLICY_URL` unset); once enabled,
a caller who hasn't called `PrivacyService.AcknowledgePrivacyNotice` for the node's current
`PRIVACY_NOTICE_VERSION` gets `FAILED_PRECONDITION`/`PRIVACY_NOTICE_NOT_ACKNOWLEDGED` instead of
the RPC running. Reads are never gated. Wired today on `PostService.CreatePost`; `send DM`
(`MessagesController.sendMessage`/`createConversation`) and `follow` (`SocialGraphService.
FollowActor`) are the same shape of gate but live outside this task's owned file set — a
follow-up for whoever next touches `apps/server/src/modules/messages/**`/`graph/**`.

### FeedService (§52) — implemented (P3-002)

| RPC                 | Notes                                                                                                                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ListHomeFeed`      | fan-out-on-read, chronological; own posts + posts by followed actors only; requires an authenticated session                                                                                                                                                                                              |
| `ListLocalFeed`     | chronological, local public posts; anonymous-callable, but honors a sent bearer token for block/mute/`FOLLOWERS`-visibility filtering; excludes posts by an actor with `show_in_local_feed = false` (§197.5, P14-029) — the posts remain public elsewhere (profile, home feed of a follower, direct link) |
| `ListActorPosts`    | a given actor's posts; same optional-viewer behavior as `ListLocalFeed`                                                                                                                                                                                                                                   |
| `ListTagFeed`       | chronological public, non-community posts for a normalized tag; block/mute/tag-mute aware                                                                                                                                                                                                                 |
| `ListCommunityFeed` | chronological posts within a community, subject to membership and moderation state                                                                                                                                                                                                                        |

`ListBookmarks` is on `ReactionService` (P4-002), not `FeedService` — bookmarks are a private,
actor-scoped list, not a feed with visibility rules.

Explicitly never added: `GetRecommendedFeed`, `GetForYouFeed` (§52, §153).

**Visibility/block/mute filtering (§59, §62–63), shared by all three RPCs above** (see
`FeedService.applyVisibilityFilter`, `apps/server/src/modules/feeds/feed.service.ts`):
`PUBLIC`/`UNLISTED` posts are always eligible; a `FOLLOWERS`-visibility post is eligible only
to its own author or an actor who follows them; a post is excluded if the viewer blocks its
author or is blocked by them (either direction), and excluded if the viewer mutes its author.
With no viewer (anonymous `ListLocalFeed`/`ListActorPosts`), only `PUBLIC`/`UNLISTED` posts are
eligible — there is no viewer to test a `FOLLOWERS` post or a block/mute against.
`ListHomeFeed` additionally restricts the candidate set to the viewer's own posts plus posts
by actors the viewer follows. Home feed reposts are ordered at the repost pointer's own time,
collapse duplicates within a page, and expose at most three reposter attributions. Local and
home feeds exclude community posts unless the viewer is a member.

**Query plan verified** (`EXPLAIN (ANALYZE, BUFFERS)`, ~60,000 seeded posts, one actor
following 20 of 50 seeded authors): both `ListLocalFeed`'s and `ListHomeFeed`'s queries plan
as an `Index Scan using idx_posts_created_at_id on posts` with no sequential scan on `posts`
(sub-millisecond execution: 0.089ms / 0.247ms). At a much smaller table size (~4,000 rows) the
planner correctly prefers a `Seq Scan` instead — expected cost-based behavior for a table that
small, not a missing index. `blocks`/`mutes` are seq-scanned inside the anti-join, which is
fine at their current size (a handful of rows per actor); revisit if either table grows large
enough for the per-row `NOT EXISTS` check to matter.

### MediaService (§54) — implemented in `media.proto` (Phase 5)

| RPC                   | Returns                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `BeginMediaUpload`    | media ID, presigned PUT URL, expiration                                |
| `FinalizeMediaUpload` | media ID, `MediaStatus` (transitions `PENDING` → `PROCESSING`)         |
| `GetMediaDownload`    | media ID, `MediaStatus`, MIME, dimensions, download URL, thumbnail URL |

`BeginMediaUpload` issues a presigned PUT (MinIO in dev, Cloudflare R2 in prod, ADR 0015);
`FinalizeMediaUpload` enqueues a worker `PROCESS_MEDIA` job that produces Sharp derivatives
before the media transitions to `READY`; `GetMediaDownload` serves the processed asset. No
image bytes are proxied through Node (§153).

### ReactionService (§53) — implemented in `reactions.proto` (P4-002)

| RPC                               | Notes                                                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LikePost` / `UnlikePost`         | idempotent; reuses `PostService.getPost`'s existence/block check (§62) and returns updated `PostCounts`/`PostViewerState`; a genuinely new like notifies the post's author |
| `BookmarkPost` / `UnbookmarkPost` | idempotent; bookmarks are private                                                                                                                                          |
| `ListBookmarks`                   | the caller's own bookmarks only, keyset-paginated `(created_at DESC, post_id DESC)`                                                                                        |
| `ListPostLikers`                  | anonymous-callable; keyset-paginated `(created_at DESC, actor_id DESC)`                                                                                                    |
| `RepostPost` / `UnrepostPost`     | idempotent pointer-row reposting with visibility, tombstone, and block checks; a new repost notifies the author                                                            |
| `ListPostReposters`               | keyset-paginated reposter list, filtered for viewer block/mute state                                                                                                       |

### ModerationService (§55, §61–64) — implemented in `moderation.proto` (P6-001/P6-002)

| RPC                           | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BlockActor` / `UnblockActor` | idempotent; blocking removes any existing follow in either direction (§62) and returns the updated `Relationship`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `MuteActor` / `UnmuteActor`   | idempotent; never touches an existing follow (§63); returns the updated `Relationship`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ListBlocks` / `ListMutes`    | the caller's own list, keyset-paginated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ReportPost` / `ReportActor`  | rate-limited (10/hour per network peer, `ReportRateLimitService`); bounded 2,000-character `details`; always creates an `OPEN` `reports` row — resolving a report has no RPC of its own, it's `patches-admin report resolve` (§65, P6-003, `docs/operations/moderation.md`)                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ReportMessage`               | applies the same bounds/rate limit and stores a stable snapshot of the reported message plus up to ten surrounding messages                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ListModerationLog`           | Status: implemented (P14-012, account/post entries P14 follow-up) — **unauthenticated**, keyset-paginated over `moderation_log_entries`; domain-kind entries are fully identified, account/post/media entries are anonymized by construction (no actor-id/post-id column to leak). `patches-admin domain block` writes a `DOMAIN_BLOCK` row; `user suspend`/`user delete` write `SUSPEND`/`BAN` account-kind rows; `report resolve --action remove-post`/`--action suspend` write `POST_REMOVAL`/`SUSPEND` rows (reason category mapped from the report's own `reason`) — `--action none` writes none (`apps/admin/src/commands/{user,report}.ts`, see `docs/operations/moderation.md`) |
| `ListMyModerationNotices`     | Status: implemented (P14-011) — authenticated (reachable even from a **suspended** account, `SuspensionTolerantAuthGuard` — see below); a live read projection of `admin_audit_log` rows that acted on the caller, never a second source of truth; explanation is synthesized (never `reports.moderator_note`) for a `report.resolve`-derived notice                                                                                                                                                                                                                                                                                                                                    |

No user-facing RPC exposes internal moderator notes (`reports.moderator_note`), and there is
no gRPC surface for the admin CLI at all — `apps/admin` reads/writes PostgreSQL directly
through `@patches/database`, deliberately bypassing this API contract entirely (see
`docs/operations/moderation.md`).

`ListMyModerationNotices` and every `AppealService` RPC below (§201.2, §201.3) use
`SuspensionTolerantAuthGuard` (`apps/server/src/modules/moderation/suspension-tolerant-auth.
guard.ts`) rather than the ordinary `AuthGuard` — every other authenticated RPC in this
document still rejects a suspended account outright (`ACCOUNT_SUSPENDED`). A suspension is
precisely the enforcement action being appealed, so the ordinary guard's blanket rejection
would make the appeal mechanism unreachable for its single most common case. A **deleted**
account gets the same carve-out (P14 follow-up) while its `account_deletion_requests` row is
still inside its grace period (not cancelled, not yet purged, `purge_after` not yet passed) —
`patches-admin user delete`'s grace-period-then-purge deletion is itself an appealable
enforcement action, so an already-issued access token stays usable for exactly the
`SuspensionTolerantAuthGuard`-gated RPCs until the account is actually purged. Past the grace
period (or once cancelled/purged) the guard rejects the same way it always did — there is
nothing left to appeal a ban notice through once the account is truly gone.

Block/mute enforcement beyond `FeedService`'s visibility filter (already in place since P3-002):
`PostService.getPost`/`listReplies` and `ReactionsService`'s every RPC (via `getPost`) return
`POST_NOT_FOUND` uniformly for a blocked-either-direction post/actor, never `PERMISSION_DENIED`
— see `PostService`'s doc comment for why.

### NotificationService (§56, §113) — implemented in `notifications.proto` (P4-003)

| RPC                     | Notes                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ListNotifications`     | cursor-paginated `(created_at DESC, id DESC)`                                                                               |
| `MarkNotificationsRead` | collapses spec §56's `MarkNotificationRead`/`MarkAllNotificationsRead` into one idempotent RPC (`through_id` or `mark_all`) |
| `GetUnreadCount`        |                                                                                                                             |

`NotificationsService.notifyFollow`/`notifyLike`/`notifyReply`/`notifyMention`/`notifyRepost`/
`notifyQuote`/`notifyMessage`/`notifyCommunityInvite` are the write side, called from the
owning service as a side effect
of their own writes — spec §113 has no separate event service. Every notify path skips
self-notification and respects blocks (§62) and mutes (§63) before ever writing a row, and
dedupes via partial unique indexes on `notifications` (§113).

### TagService (§181) — implemented in `tags.proto` (P11-005)

`SearchTags` returns up to 20 normalized tags in alphabetical order. `MuteTag`, `UnmuteTag`,
and `ListMutedTags` manage the caller's private tag filters. Post writes normalize using NFKC
and case-folding, reject unsafe/control-like forms and all-digit tags, and accept at most ten.

### CommunityService (§182) — implemented in `communities.proto` (P11-003)

Provides create/get/search, membership, invitation, ban, and moderator RPCs. Creation is
capability- and rate-limit-gated and idempotent by creator plus `client_request_id`; the creator
becomes the first moderator. Moderation changes are audit logged, and removing a community
clears its posts' `community_id`.

### DirectMessageService (§183) — implemented in `messages.proto` (P11-004)

Provides conversation creation/list/get, send/list/delete, request accept/decline, unread
marking, and archive operations. Direct threads require mutual follows or an accepted request;
pending requests allow one message, declined pairs have a 30-day bar, groups are capped at
eight, and block failures do not expose a recipient oracle. Messages are sanitized text,
sender deletion is a tombstone, and unread state is per viewer without read receipts.

No push infrastructure until a mobile client exists — the TUI polls while active and
supports manual refresh.

`Conversation.security_mode` is read-only and fixed at creation. `CreateConversation` always
produces `CONVERSATION_SECURITY_MODE_LEGACY_SERVER_VISIBLE`; there is no RPC in this service that
converts a conversation between modes. Clients render the §183.1/§194 disclosure from that field.

### E2eeService (§183, §194, §195.1) — implemented node-side, capability disabled (`e2ee.proto`, ADR 0020)

**Status: every RPC below has a real controller/service/repository path in `apps/server`
(P13-002–P13-009) and integration coverage.** The production rollout state stays
`E2EE_CAPABILITY_STATE_DISABLED` and the reviewed franking-profile list is still empty, so a
default node fails E2EE sends closed; operating the one unreviewed profile is confined to ADR
0027's explicit `E2EE_UNREVIEWED_DEV_MODE=true` test mode. Independent review (P13-014) remains
the ship gate — this is behaviour that exists, not a generally available capability. See
[`e2ee.md`](./e2ee.md) for the boundary and the state machines.

| RPC                          | Status      | Notes                                                                                                                                                                                                                                                    |
| ---------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetE2eeCapability`          | implemented | Rollout state and the node's copy of the protocol constants. Callable before enrollment, so a client can discover E2EE is unavailable before offering it.                                                                                                |
| `PublishIdentityRoot`        | implemented | Publishes or rotates the caller's messaging identity root. The node stores and serves it; it never certifies it.                                                                                                                                         |
| `GetIdentityRoot`            | implemented | First-contact material, not proof — safety-number comparison is the authentication control.                                                                                                                                                              |
| `EnrollDevice`               | implemented | Certificate + roster `n+1` + initial prekeys, atomically. A half-enrolled device is not a state the schema allows.                                                                                                                                       |
| `RevokeDevice`               | implemented | Roster excluding the device; unused prekeys deleted. Never a remote wipe, and it cannot retract what the device holds.                                                                                                                                   |
| `PublishDeviceRoster`        | implemented | Appends roster `current.sequence + 1`, chained to the current digest. Rejected otherwise.                                                                                                                                                                |
| `GetDeviceRoster`            | implemented | Newest roster plus the device certificates it references.                                                                                                                                                                                                |
| `ListDeviceRosters`          | implemented | Keyset over the roster log, so a client verifies the hash chain itself instead of trusting a newest-roster claim.                                                                                                                                        |
| `UploadPrekeys`              | implemented | Rotate the signed prekey and/or top up one-time prekeys.                                                                                                                                                                                                 |
| `GetPrekeyInventory`         | implemented | The calling device's own counts only — another actor's remaining count is an availability oracle.                                                                                                                                                        |
| `ClaimPrekeyBundles`         | implemented | One bundle per active recipient device; consumes at most one one-time prekey per device per call; draining is rate-limited.                                                                                                                              |
| `CreateE2eeConversation`     | implemented | The only way to produce `CONVERSATION_SECURITY_MODE_E2EE_V1`. Separate from `CreateConversation`, which takes a plaintext body.                                                                                                                          |
| `GetE2eeConversationState`   | implemented | Membership epoch, members, rosters and active devices — everything a correct fanout needs.                                                                                                                                                               |
| `AddE2eeMember`              | implemented | Appends one device-signed group-control event establishing the next membership epoch and inserts (or revives) the member row. The added member receives future messages only; group size stays bounded at 8.                                             |
| `RemoveE2eeMember`           | implemented | The same transcript append with `REMOVED`: the subject's devices drop out of every later fanout and stale-epoch sends are rejected whole. Already-delivered mail stays readable — never a remote wipe.                                                   |
| `ListE2eeGroupControlEvents` | implemented | Keyset over the group-control transcript from the caller's last verified epoch forward, so clients verify the membership hash chain themselves instead of trusting the node's current-epoch claim (`ListDeviceRosters`' conversation-level counterpart). |
| `SendEnvelopes`              | implemented | One logical message as one atomic, exactly-covering per-device fanout; returns the node's franking tag.                                                                                                                                                  |
| `ListMailboxEnvelopes`       | implemented | Keyset on `(received_at, envelope_id)` ascending. Poll-based; no push, no stream, no sort parameter.                                                                                                                                                     |
| `AcknowledgeEnvelopes`       | implemented | Lets the node clean the mailbox. Never surfaced to the sender — that would be a read receipt (§183.3, §194).                                                                                                                                             |
| `AttachReportEvidence`       | implemented | Franking commitment + reporter-disclosed plaintext against an existing report. The node verifies; it never decrypts.                                                                                                                                     |

`E2eeReportEvidenceItem.disclosed_plaintext` is the single intentional plaintext field in the whole
schema. Everything else the node touches is opaque bytes.

### 3a. Amendment C services (§196–§210)

**Status: implemented, except the graduated domain-limit tier (§201.5's `limit`/`silence`,
explicitly a §210 sign-off item, not shipped in v1).** `PrivacyService` (P14-010),
`FilterService` (P14-007), `FilterListService` (P14-008), `LabelService` (P14-009), and
`AppealService` (P14-011) all have a real Nest module/service/repository behind them end to
end — see their own subsections below for what that does and does not cover.
`NodeService.GetNodePolicy` and `ModerationService.ListModerationLog`/
`ListMyModerationNotices` are covered in §3 above (`NodeService`/`ModerationService` are not
new services, just extended by this amendment). Amendment C's organizing rule —
filters/lists/labelers act on what a _viewer_/_subscriber_ sees, the node floor (reports,
moderator review, the audit log) is unchanged and unweakened and now transparent and
appealable (§201.1), and nothing here ever ranks, scores, or reorders anything (§194, §208) —
governs every implementation in this section.

#### FilterService (§198) — implemented in `filters.proto` (P14-007)

| RPC             | Notes                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateFilter`  | up to 50 filters/actor, 20 terms/filter (§204); literal terms only — no user-supplied regex, ever (§198.2, §208)                                   |
| `UpdateFilter`  | `google.protobuf.FieldMask`-selected partial update, same pattern as `ActorService.UpdateProfile`                                                  |
| `DeleteFilter`  | idempotent — deleting an already-gone (or never-owned) filter id is not an error (§62)                                                             |
| `ListFilters`   | the caller's own filters, most recent first                                                                                                        |
| `ExportFilters` | plain, documented JSON — never a binary blob or executable format (§153, §198.5)                                                                   |
| `ImportFilters` | additive; `apply = false` previews what would be added without writing anything; a malformed entry is skipped rather than failing the whole import |

Evaluation is wired at the same chokepoint blocks/mutes already use
(`apps/server/src/modules/feeds/feed.service.ts`'s `page()`/`listHomeFeed()`, via the pure
matching helpers in `apps/server/src/modules/filters/filter-matching.ts`) for `ListHomeFeed`,
`ListLocalFeed`, `ListTagFeed`, and `ListCommunityFeed` — **not** `ListActorPosts`, which spec
§198.3 explicitly excludes ("threads and profiles are deliberately not filterable in v1"; there
is no `PROFILE`/`ACTOR` value in `FilterScope`). `hide` is enforced by omission on the server —
a hidden post never reaches the client, so a page can legitimately contain fewer items than
requested (clients must page on `PageInfo`, not item count); `page()` re-fetches in a **bounded**
number of rounds (`MAX_FILTER_ROUNDS = 4`) to backfill a short page where it can, advancing the
cursor to the last row examined each round — never an unbounded loop (§198.4). `collapse`/`warn`
surface as `Post.filtered_by` instead. `actor`/`tag`/`domain`/`substring`/`word` terms are all
evaluated in the application service (not pushed into SQL as §198.4's implementation note
suggests for `actor`/`tag`) — a documented v0 simplification; see the class doc on
`filter-matching.ts` and this task's report for the trade-off.

#### FilterListService (§199) — implemented in `filter_lists.proto` (P14-008)

| RPC                                 | Notes                                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PublishFilterList`                 | personal or (via `owner_community_id`, requiring the caller be a moderator) community-owned; up to 10 lists per owner, 2,000 entries/list (§204)                            |
| `UpdateFilterList`                  | field-mask partial update; `name`/ownership immutable after publish                                                                                                         |
| `DeleteFilterList`                  | idempotent; owner-actor or community-moderator only                                                                                                                         |
| `GetFilterList` / `ListFilterLists` | lists are public by construction (§199.1) — anonymous-readable, no viewer gate                                                                                              |
| `ListFilterListEntries`             | the full entry set — anonymous-readable, always (§199.3)                                                                                                                    |
| `SubscribeFilterList`               | applies entries as filters/mutes with a subscriber-chosen action (default `collapse`); upsert (re-subscribing updates the action); **never creates a block** (§199.2, §208) |
| `UnsubscribeFilterList`             | instant and complete — also clears the caller's per-entry exceptions on that list, so a later re-subscribe never inherits a stale exception set (§199.3)                    |
| `ListFilterListSubscriptions`       | the caller's own subscriptions only — subscriber counts are never published anywhere, on this or any other RPC in this pair (§199.3, §208)                                  |
| `SetFilterListEntryException`       | per-entry opt-out without unsubscribing or notifying the list author; requires an active subscription to the list                                                           |

**Proto/spec gap, recorded rather than silently resolved:** §199.2's prose says a subscriber
chooses "an action and scopes"; the shipped `SubscribeFilterListRequest` has no `scopes` field.
List-derived rules are therefore applied to every scope, unconditionally — see
`filter-matching.ts#loadEffectiveFilterRules`'s doc comment.

#### LabelService (§200) — implemented in `labels.proto`/`modules/labels/**` (P14-009)

| RPC                                       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateLabeler`                           | personal (caller's own actor) or, via `community_id`, community-owned (requires the caller be a moderator); every node also runs an implicit `is_node_labeler` one, seeded idempotently at boot from `LABEL_VOCABULARY` (`label-seed.service.ts`) and re-synced on every boot                                                                                                                                                            |
| `GetLabeler` / `ListLabelers`             | anonymous-readable — a labeler and its vocabulary are public, like a community                                                                                                                                                                                                                                                                                                                                                           |
| `ApplyLabel`                              | rate-limited 300/day per labeler (§204, §200.5, keyed on the labeler, not the caller); `value` must be one of the labeler's own node-published vocabulary — free text is prohibited (§200.2, §208); idempotent (re-applying the same still-active `(labeler, subject, value)` returns the existing row); forbidden on the node's own labeler through this RPC (§200.5, §208 — no gRPC-session concept of node-operator authority exists) |
| `RetractLabel`                            | sets `retracted_at`; history is preserved, never hard-deleted (§200.1); idempotent                                                                                                                                                                                                                                                                                                                                                       |
| `SubscribeLabeler` / `UnsubscribeLabeler` | a label is visible only to subscribers — labeling someone has zero effect on anyone who hasn't opted in (§200.3); a no-op on the node's own labeler, which is subscribed by default and not togglable in v0                                                                                                                                                                                                                              |
| `SetLabelerSubscriptionAction`            | per-value action override; any value may be set to `ignore` except one the labeler's vocabulary marks `mandatory` (§200.3)                                                                                                                                                                                                                                                                                                               |
| `ListLabelsOnSubject`                     | pull-only self-inspection (§200.4) — an actor is never notified that they were labeled; when the caller _is_ the subject (their own account, or a post they authored), every label is visible regardless of subscription; otherwise subscription-scoped like `Post.labels`                                                                                                                                                               |

Labels never affect feed position, search position, or delivery, and are never aggregated into
a count/reputation/trust score for anyone (§200.3, §208). `Post.labels` is populated by
`feeds/post-batch.ts` via `LabelService.labelsForPosts`/`modules/labels/label-lookup.ts`'s
shared, non-DI query — feed reads only so far (`modules/posts/post.service.ts`'s single-post
paths still return an empty list, a follow-up task). The closed vocabulary the node's own
labeler publishes comes from the `LABEL_VOCABULARY` env var (comma-separated, also read by
`NodeService.GetNodePolicy`'s `label_vocabulary`).

#### AppealService (§201.3) — implemented in `appeals.proto` and `apps/server/src/modules/appeals/**` (P14-011)

| RPC             | Notes                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateAppeal`  | `moderation_notice_id` is the `admin_audit_log.id` the notice projects from; only the acted-upon actor may appeal (`MODERATION_NOTICE_NOT_FOUND` for anyone else — no oracle, §62/§64's pattern); one appeal per notice (`APPEAL_ALREADY_EXISTS`); rejected once the node's appeal window has closed (`APPEAL_WINDOW_CLOSED`, `APPEAL_WINDOW_DAYS`); rate-limited 5/day per actor (`RATE_LIMITS.appealFiledPerDay`) |
| `GetAppeal`     | visible only to the appellant — never the reporter, never the public log (§201.3, §208)                                                                                                                                                                                                                                                                                                                             |
| `ListMyAppeals` | the caller's own appeals, keyset-paginated                                                                                                                                                                                                                                                                                                                                                                          |

Every RPC here requires an authenticated session via `SuspensionTolerantAuthGuard`, not the
ordinary `AuthGuard` — see the note under `ModerationService` in §3 above. Admin-side
resolution is CLI-only (`patches-admin appeal list|inspect|resolve`, extending the existing
`report list|inspect|resolve` pattern, §65, `docs/operations/moderation.md`) — there is
deliberately no gRPC resolve RPC; resolution never automatically reverses the underlying
enforcement action (an admin who overturns a suspension still runs `user unsuspend`
separately, spec §206).

#### PrivacyService (§197) — implemented in `privacy.proto` and `apps/server/src/modules/privacy/**` (P14-010)

| RPC                        | Notes                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `AcknowledgePrivacyNotice` | records that the notice text was shown — never a waiver, never gates a safety/export/deletion function (§197.1) |
| `GetPrivacyPrefs`          | `discoverable`/`indexable`/`show_in_local_feed`/`locked` + notice acknowledgement state (§197.5)                |
| `UpdatePrivacyPrefs`       | field-mask partial update, same pattern as `ActorService.UpdateProfile`                                         |
| `ExportAccount`            | enqueues a background job (§30, ADR 0004) — never synchronous, never streams the archive through this process   |
| `GetExportStatus`          | one ready archive at a time, expires after 7 days (§204)                                                        |
| `RequestAccountDeletion`   | moves the account to "pending deletion"; disappears from feeds/search/local-timeline immediately (§197.4)       |
| `CancelAccountDeletion`    | restores the account intact, only within the grace period (default 30 days, node-configurable)                  |
| `GetDeletionStatus`        |                                                                                                                 |

`AuthService.Register` records the account's initial acknowledgement itself, via
`RegisterRequest.privacy_notice_version_acknowledged` (P14-025, §204.2) — spec §197.1
requires a client to show the notice summary before the account exists, so by the time
`Register` succeeds that has already happened. When `REQUIRE_PRIVACY_ACK=true`, `Register`
rejects with `FAILED_PRECONDITION`/`PRIVACY_NOTICE_NOT_ACKNOWLEDGED` unless this field equals
the node's current `PRIVACY_NOTICE_VERSION`; when the flag is off (the default), any value —
including the field's `0` zero-value default, for pre-P14-025 clients — is accepted and
stamped as-is, since the notice has necessarily already been shown by the time this RPC is
called regardless. `ExportAccount`/`RequestAccountDeletion` only ever write a row and enqueue a
durable `outbox_jobs` row (`EXPORT_ACCOUNT`/`PURGE_ACCOUNT` — `docs/architecture/jobs.md` §9);
`apps/worker`'s `ExportAccountHandler`/`PurgeAccountHandler` do the actual work. The export
archive is currently one self-describing JSON document (not the fuller directory-tree-plus-
media-files layout §197.3 describes) — a documented v0 simplification, not a data-loss bug;
see the archive's own embedded `readme` field. The `PURGE_ACCOUNT` job's scope is posts and
bodies, media objects, follows, likes, DMs sent, sessions, credentials, and the notice
acknowledgement itself — not yet bookmarks/reposts/community memberships/muted tags (nor
filters/lists/labeler subscriptions, which this node doesn't implement yet). `patches-admin
user delete` now routes through this same request-then-purge path in addition to its existing
immediate status flip, rather than being a second, weaker deletion.

`locked` (follow requests, a correctness fix for the previously-unenforced `FOLLOWERS`
visibility promise) is accepted and stored by `UpdatePrivacyPrefs`, and is now **enforced**:
`modules/graph`'s `FollowActor` creates a pending `follow_requests` row instead of an immediate
follow against a locked local actor (§197.5, see `SocialGraphService` above and
`docs/architecture/social.md`). `FOLLOWERS`-visibility posts are private to accepted followers
for real as of this change — clients may now describe them as such.

## 4. Metadata conventions (§44)

| Metadata key               | Purpose                              |
| -------------------------- | ------------------------------------ |
| `authorization`            | `Bearer <access-token>`              |
| `x-request-id`             | correlation ID, propagated into logs |
| `x-patches-client-version` | client build/version string          |
| `x-patches-client`         | optional client type, e.g. `tui`     |

### Deadlines

Every RPC call **must** carry a deadline — no call waits forever.

| Call class            | Default deadline |
| --------------------- | ---------------- |
| Normal unary request  | 10 seconds       |
| Upload initialization | 10 seconds       |
| Authentication        | 15 seconds       |

(Defaults — adjustable per RPC if a concrete reason emerges.)

## 5. Retry policy (§45)

- Reads MAY retry transient failures automatically.
- Writes MUST NOT blindly retry unless the request is provably idempotent.
- Creation RPCs (for example `CreatePost`, `CreateCommunity`, and DM creation/sends) carry a client-generated `client_request_id`
  (UUID). The backend enforces a uniqueness constraint conceptually
  `(author_actor_id, client_request_id)` so a client-side retry cannot duplicate
  server state.

## 6. Pagination (§46)

Cursor/keyset pagination only — **never offset pagination** for timelines (also
listed as a hard prohibition, §153).

Canonical ordering: `created_at DESC, id DESC`.

```proto
message PageInfo {
  string next_cursor = 1;
  bool has_more = 2;
}
```

The cursor is server-generated and opaque to clients — clients must not construct or
interpret it. No raw SQL offsets are ever exposed.

## 7. Error model (§57)

Application error codes are transport-independent, then mapped consistently onto
gRPC status codes. Stack traces are never exposed to clients; request IDs are
included in error metadata/messages where useful.

| Application error code            | gRPC status           |
| --------------------------------- | --------------------- |
| `AUTH_INVALID_CREDENTIALS`        | `UNAUTHENTICATED`     |
| `AUTH_EMAIL_UNVERIFIED`           | `FAILED_PRECONDITION` |
| `AUTH_SESSION_EXPIRED`            | `UNAUTHENTICATED`     |
| `ACCOUNT_SUSPENDED`               | `PERMISSION_DENIED`   |
| `ACTOR_NOT_FOUND`                 | `NOT_FOUND`           |
| `HANDLE_TAKEN`                    | `ALREADY_EXISTS`      |
| `ACTOR_BLOCKED`                   | `PERMISSION_DENIED`   |
| `POST_NOT_FOUND`                  | `NOT_FOUND`           |
| `POST_FORBIDDEN`                  | `PERMISSION_DENIED`   |
| `POST_TOO_LONG`                   | `INVALID_ARGUMENT`    |
| `MEDIA_TOO_LARGE`                 | `INVALID_ARGUMENT`    |
| `MEDIA_UNSUPPORTED_TYPE`          | `INVALID_ARGUMENT`    |
| `MEDIA_NOT_READY`                 | `FAILED_PRECONDITION` |
| `MEDIA_NOT_FOUND`                 | `NOT_FOUND`           |
| `RATE_LIMITED`                    | `RESOURCE_EXHAUSTED`  |
| `VALIDATION_ERROR`                | `INVALID_ARGUMENT`    |
| `INTERNAL_ERROR`                  | `INTERNAL`            |
| `CLIENT_VERSION_UNSUPPORTED`      | `FAILED_PRECONDITION` |
| `NOT_IMPLEMENTED`                 | `UNIMPLEMENTED`       |
| `PAGE_NOT_FOUND`                  | `NOT_FOUND`           |
| `PAGE_FORBIDDEN`                  | `PERMISSION_DENIED`   |
| `GUESTBOOK_ENTRY_NOT_FOUND`       | `NOT_FOUND`           |
| `CONVERSATION_NOT_FOUND`          | `NOT_FOUND`           |
| `MESSAGE_NOT_FOUND`               | `NOT_FOUND`           |
| `MESSAGE_REQUEST_NOT_FOUND`       | `NOT_FOUND`           |
| `DM_DISABLED`                     | `FAILED_PRECONDITION` |
| `COMMUNITY_NOT_FOUND`             | `NOT_FOUND`           |
| `COMMUNITY_NAME_TAKEN`            | `ALREADY_EXISTS`      |
| `COMMUNITY_FORBIDDEN`             | `PERMISSION_DENIED`   |
| `COMMUNITY_BANNED`                | `PERMISSION_DENIED`   |
| `COMMUNITY_INVITE_NOT_FOUND`      | `NOT_FOUND`           |
| `TAG_NOT_FOUND`                   | `NOT_FOUND`           |
| `FILTER_NOT_FOUND`                | `NOT_FOUND`           |
| `FILTER_IMPORT_INVALID`           | `INVALID_ARGUMENT`    |
| `FILTER_LIST_NOT_FOUND`           | `NOT_FOUND`           |
| `FILTER_LIST_ENTRY_NOT_FOUND`     | `NOT_FOUND`           |
| `FILTER_LIST_FORBIDDEN`           | `PERMISSION_DENIED`   |
| `LABELER_NOT_FOUND`               | `NOT_FOUND`           |
| `LABEL_NOT_FOUND`                 | `NOT_FOUND`           |
| `LABELER_FORBIDDEN`               | `PERMISSION_DENIED`   |
| `LABEL_VALUE_INVALID`             | `INVALID_ARGUMENT`    |
| `MODERATION_NOTICE_NOT_FOUND`     | `NOT_FOUND`           |
| `APPEAL_NOT_FOUND`                | `NOT_FOUND`           |
| `APPEAL_ALREADY_EXISTS`           | `ALREADY_EXISTS`      |
| `APPEAL_WINDOW_CLOSED`            | `FAILED_PRECONDITION` |
| `PRIVACY_NOTICE_NOT_ACKNOWLEDGED` | `FAILED_PRECONDITION` |
| `FOLLOW_REQUEST_NOT_FOUND`        | `NOT_FOUND`           |
| `SIGN_IN_REQUIRED`                | `UNAUTHENTICATED`     |
| `PASSWORD_AUTH_DISABLED`          | `FAILED_PRECONDITION` |

There is no `TAG_INVALID` code — an invalid tag grammar (too many tags, bad prefix, etc.) is a
generic `VALIDATION_ERROR`/`INVALID_ARGUMENT`, same as any other malformed input (§57). Full
source of truth: `apps/server/src/common/errors/error-codes.ts`, whose own doc comments record
which codes are outside spec §57's starter list and why.

`AUTH_EMAIL_UNVERIFIED` and `MEDIA_NOT_READY` are mapped to `FAILED_PRECONDITION`
because the request is well-formed but the resource/account is not yet in a state
that permits the action — the canonical gRPC semantics for that status.

`NOT_IMPLEMENTED` is for an RPC that exists in the schema but nothing on this node answers
yet (`BeginGitHubLogin`/`PollGitHubLogin` until Phase 6, §176) — distinct from a client asking
for something malformed, which is `VALIDATION_ERROR`/`INVALID_ARGUMENT`.

`SIGN_IN_REQUIRED` is `PublicReadGuard`'s (`apps/server/src/common/guards/public-read.guard.ts`)
code for a node running with `PUBLIC_READ=false` (owner decision, 2026-08-19): an invite-only
node gates _posting_, not _reading_, by default, but an operator may opt into closing reads
entirely. When closed, every RPC outside a small always-open allow-list (`SystemService.*`,
`NodeService.GetNodeInfo`/`GetNodePolicy`, `AuthService.*`) rejects an unauthenticated caller
with this code instead of `AUTH_INVALID_CREDENTIALS`/`AUTH_SESSION_EXPIRED` — distinct so a
client can show "this node requires sign-in to read" rather than implying the caller's
credentials were wrong.

## 8. Input limits (§58)

| Field                | Limit                                            |
| -------------------- | ------------------------------------------------ |
| Post body            | 5,000 Unicode characters                         |
| Bio                  | 500 characters                                   |
| Display name         | 80 characters                                    |
| Handle               | 30 characters (3–30, see §22)                    |
| Location text        | 100 characters                                   |
| Website URL          | 2,048 characters                                 |
| Alt text             | 1,000 characters                                 |
| Search query         | 100 characters                                   |
| Image upload         | 10 MB, 20 megapixel max decoded dimensions (§28) |
| Attachments per post | 4 images (§27)                                   |

These starting values are adjustable, but limits must exist in three places
simultaneously: protobuf/API-level validation, service-layer validation, and
database constraints where practical (§58, §103).

## 9. Version compatibility (§83)

The TUI sends client version and protocol version metadata on every call
(`x-patches-client-version`). The server rejects impossibly old clients with a
useful, actionable error rather than a generic failure.

Protobuf compatibility rules (Buf, §41):

- `buf breaking` runs in CI and **must** reject breaking changes against `main`
  unless a new API version is being intentionally introduced.
- Field numbers are never reused after removal.
- Removed fields and field numbers are `reserve`d, not silently deleted.
- `buf format`, `buf lint`, and `buf generate` are run as part of the standard
  workflow, not just CI.

## 10. Buf workflow summary

```bash
buf format     # canonical formatting
buf lint       # style/consistency rules
buf breaking   # compare against main; fail on incompatible changes
buf generate   # emit ts-proto output
```

CI treats `buf format`, `buf lint`, and `buf breaking` as required PR checks (see
`overview.md` §CI in the parent spec, §120).

## 11. Connect edge (web/RN clients, ADR 0016)

**Status: server-side implemented (P10-004).** Browsers and React Native cannot speak
gRPC-over-HTTP/2, so the same schema is also served over the
[Connect protocol](https://connectrpc.com) — plain HTTP/1.1 or HTTP/2, JSON or protobuf
binary, `fetch`-compatible — on the same always-on HTTP listener that serves `/healthz`
(`HTTP_PORT`, default `8080`). gRPC on `:50051` is unchanged and stays the TUI's transport.

**Codegen.** `packages/proto/buf.gen.yaml` runs a second plugin, `protoc-gen-es` (v2,
`target=ts`, `import_extension=js`), emitting `packages/proto/src/generated-es/` — protobuf-es
message classes and `GenService` descriptors, one `_pb.ts` per `.proto` file. Exported as
`@patches/proto/es`, alongside `PATCHES_V1_FILES` (every generated `GenFile`, hand-maintained —
add a new `.proto` file's `file_...` const to that array when adding one). This is a fully
independent codegen from the root/`./nest` ts-proto output: protobuf-es keeps its own canonical
wire representation (numeric enums, `bigint` `Timestamp.seconds`), and the two families never
meet in one process.

**The Connect edge is a byte-level proxy, not a second controller layer**
(`apps/server/src/transport/connect/`):

- `grpc-proxy.ts` walks every `GenService` in `PATCHES_V1_FILES` and registers a generic
  handler for each unary method (the schema has no streaming RPCs — enforced by
  `packages/proto/src/es.test.ts` and a runtime backstop in `registerGrpcService` itself).
  Each call: decode the Connect request (already done by `ConnectRouter` before the handler
  runs) → `toBinary` it → `client.makeUnaryRequest` a raw grpc-js `Client` dialing the
  in-process gRPC server over loopback (`127.0.0.1:GRPC_PORT`, never a public address) →
  `fromBinary` the response. No mapper, guard, rate limiter or error mapping is duplicated —
  every Connect call runs through the exact same `AuthGuard`, `RequestContextInterceptor` and
  `RpcExceptionsFilter` a gRPC call does.
- gRPC status codes map 1:1 onto Connect `Code` values (numerically identical, 1–16); a
  `ServiceError`'s `x-patches-error-code`/`x-request-id` trailer metadata is carried over onto
  the thrown `ConnectError`'s `.metadata` unchanged.
- Only `authorization`, `x-request-id`, `x-patches-client`, `x-patches-client-version`,
  `user-agent` and `accept-language` are forwarded from the incoming HTTP request; a
  caller-supplied `x-forwarded-for` is **never** forwarded — the internal call's
  `x-forwarded-for` is always Express's own `req.ip` (honouring `TRUST_PROXY_HEADERS`, same
  flag gRPC's peer derivation already used).

**Auth.** `authorization: Bearer <access token>` only — no cookies, no CSRF surface. Refresh
uses the same `AuthService` RPCs as the TUI.

**CORS** (`transport/connect/cors.ts`): scoped to the `/patches.v1.*` path prefix, driven by
`WEB_ORIGINS` (comma-separated origin allow-list, `packages/config`'s `serverEnvShape`, default
empty = same-origin only). Never emits `Access-Control-Allow-Credentials`; an origin outside the
allow-list gets no CORS headers at all, so a browser blocks the request itself.

**Federation stays absent, not merely unrouted, when off.** `FederationModule` (the
`FEDERATION_GATEWAY` DI token + supporting services) is always registered — `PostModule`/
`ActorModule`/`GraphModule`/`ReactionModule` depend on it unconditionally — but its HTTP
controllers (webfinger/actor/inbox/outbox) live in a separate `FederationHttpModule`,
registered in `app.module.ts` only when `FEDERATION_ENABLED=true` (read once at that module's
own evaluation time, the same timing `ConfigModule.forRoot`'s `validate` already uses).

**Deployment** (`infra/fly/fly.toml`): gRPC keeps Fly `:443 → 50051`; a second `[[services]]`
exposes `:8443 → 8080` (one of Cloudflare's supported HTTPS ports) for the Connect edge, so a
public web origin can front it with Cloudflare on `:443` without contending with gRPC for the
same port.

See [ADR 0016](../decisions/0016-connect-transport-and-client-sdk.md) for the full design and
alternatives considered. `@patches/client` (the transport-agnostic SDK) and `apps/web` are
later phases (P10-003, P10-001).
