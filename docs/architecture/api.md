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
`moderation.proto`, `notifications.proto` — the full `AuthService` (including SSH login,
GitHub device-flow login, and credential management) has server handlers, `BeginGitHubLogin`/
`PollGitHubLogin` included as of P6-005 (§176, §167). `PostService`
(`CreatePost`/`GetPost`/`DeletePost`/`ListReplies` — `ListReplies` is a cursor-paginated,
bounded-depth breadth-first walk, not just direct replies; `CreatePost` also accepts
`content_warning`, B-018) and `ActorService` (`GetActor`/`GetActorByHandle`/`UpdateProfile` —
including a bounded `nameplate`, §173 — `SearchActors`, `ListFollowers`, `ListFollowing`) have
server handlers, all implemented by P3-001. `SocialGraphService` (`social_graph.proto`) has
server handlers for `FollowActor`/`UnfollowActor`/`GetRelationship`; `MuteActor`/`UnmuteActor`/
`BlockActor`/`UnblockActor` are implemented, but on `ModerationService` rather than
`SocialGraphService` (Phase 6, P6-001/P6-002) — the `blocks`/`mutes` tables (P3-001) are read
by the feed/relationship queries and written by `ModerationService`. `FeedService`'s
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
`ReportActor`, P6-001/P6-002), and `NotificationService`
(`ListNotifications`/`MarkNotificationsRead`/`GetUnreadCount`, P4-003) are all implemented,
with server handlers in `packages/proto` and `apps/server`. `EditPost` and `Repost` remain
**planned**, not yet in `posts.proto`. Per-RPC status is called out inline below.

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
├── social_graph.proto # implemented (FollowActor/UnfollowActor/GetRelationship only)
├── media.proto       # implemented (Phase 5)
├── moderation.proto  # implemented (P6-001/P6-002)
├── reactions.proto   # implemented (P4-002)
└── notifications.proto  # implemented (P4-003)
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
```

## 3. RPCs by service

### AuthService (§48) — implemented in `auth.proto`

| RPC                    | Notes                                                   |
| ---------------------- | ------------------------------------------------------- |
| `Register`             | invite-gated in v0                                      |
| `VerifyEmail`          | consumes an `email_verification_codes` row              |
| `Login`                | issues access + refresh token                           |
| `RefreshSession`       | rotates refresh token; reuse triggers family revocation |
| `Logout`               | revokes current session                                 |
| `LogoutAllSessions`    | revokes all sessions for the user                       |
| `RequestPasswordReset` | issues a `password_reset_codes` row                     |
| `ResetPassword`        | consumes the reset code                                 |
| `GetCurrentSession`    | returns session/actor info for the current access token |

Added by Amendment A (§168), implemented in `auth.proto`. Every login RPC returns the **same
session envelope**, so client session handling is identical regardless of credential type.
`BeginGitHubLogin`/`PollGitHubLogin` have server handlers as of P6-005 (§176); both answer
`UNIMPLEMENTED` when the node has no `GITHUB_CLIENT_ID` configured (`docs/architecture/
auth.md` §5) rather than pretending the flow works.

| RPC                | Notes                                                                           |
| ------------------ | ------------------------------------------------------------------------------- |
| `BeginSshLogin`    | issues a single-use, TTL-bounded challenge; returned regardless of enrollment   |
| `CompleteSshLogin` | verifies the agent signature over the reconstructed blob; generic failure only  |
| `BeginGitHubLogin` | device flow: returns user code, verification URI, polling interval              |
| `PollGitHubLogin`  | polls GitHub; returns pending or a session envelope                             |
| `ListCredentials`  | type, label, identifier, `created_at`, `last_used_at` — **never `secret_hash`** |
| `AddCredential`    | requires an authenticated session                                               |
| `RevokeCredential` | fails if it would revoke the last active credential                             |

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

| RPC           | Notes                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetNodeInfo` | **unauthenticated**; node domain, software version, registration mode, input limits (§58), capabilities (§174) — `capabilities` is currently an empty list (v0 grants nothing capability-gated yet) |

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

| RPC                | Notes                                                                                                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetActor`         | by ID; `counts` is real (`followers`/`following` from `follows`, `posts` from `posts`) as of P3-001                                                                                                                                                                              |
| `GetActorByHandle` |                                                                                                                                                                                                                                                                                  |
| `UpdateProfile`    | `display_name`/`bio`/`location_text`/`website_url`/`nameplate` (§173), selected by a `google.protobuf.FieldMask` (`update_mask`); `avatar` is not yet on `UpdateProfileRequest`, though `Actor.avatar`/`MediaService` both exist — wiring it into profile updates is a follow-up |
| `SearchActors`     | handle prefix (`LIKE`) + display-name match (`ILIKE`) (§112), keyset-paginated on `(created_at DESC, id DESC)`, newest matching actor first — not yet trigram/full-text                                                                                                          |
| `ListFollowers`    | cursor-paginated on the `follows` row's own `(created_at DESC, id DESC)`; `counts` left zeroed (a list summary, not `GetActor`'s guarantee)                                                                                                                                      |
| `ListFollowing`    | same as `ListFollowers`, opposite direction                                                                                                                                                                                                                                      |

`UpdateProfile`'s `nameplate.badges` is never accepted from the client (§173) — the server
mapper (`actor.service.ts`'s `buildNameplateRecord`) always carries the actor's existing
badges forward regardless of what a request sends, and validates the serialized record stays
≤ 2 KiB.

### SocialGraphService (§50) — implemented in `social_graph.proto` (P3-001), `FollowActor`/`UnfollowActor`/`GetRelationship` only

| RPC               | Notes                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FollowActor`     | v0 local accounts transition straight to `FOLLOWING`; self-follow rejected (`VALIDATION_ERROR`); a block in either direction rejected (`ACTOR_BLOCKED` → `PERMISSION_DENIED`); idempotent |
| `UnfollowActor`   | idempotent — unfollowing a non-followed actor is not an error                                                                                                                             |
| `GetRelationship` | `state` (`NONE`/`PENDING`/`FOLLOWING`), `followed_by`, `blocking`, `muting` — all require an authenticated session                                                                        |

`BlockActor`/`UnblockActor`/`MuteActor`/`UnmuteActor` are **not** on this service — they live on
`ModerationService` below (P6-001). `FollowActor.followActor` does not yet call
`NotificationsService.notifyFollow` on a new follow — flagged as a follow-up in P4-003's task
report, since `GraphService`/`GraphModule` are outside that task's owned files.

### PostService (§51) — `CreatePost`/`GetPost`/`DeletePost`/`ListReplies` implemented in `posts.proto`

| RPC           | Notes                                                                                                                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreatePost`  | requires `client_request_id`; idempotent; accepts `content_warning` (B-018); replying to a post by an actor blocked either-direction from the caller is `POST_NOT_FOUND` (§62), not `PERMISSION_DENIED`; triggers a `REPLY` notification to the parent's author and a `MENTION` notification per `@handle` found in the body (P4-003) |
| `GetPost`     | optional bearer token — with one, the author's own `viewer_state.liked`/`bookmarked` is filled in and a blocked-either-direction post is `POST_NOT_FOUND` (§62), same as `ListReplies`                                                                                                                                                |
| `DeletePost`  | soft delete / tombstone; returns the tombstoned post                                                                                                                                                                                                                                                                                  |
| `ListReplies` | cursor-paginated, bounded-depth breadth-first walk (`max_depth`, clamped 1–6, default 4) capped at 500 total nodes per call (§24); optional bearer token filters out blocked-either-direction repliers (§62); see `PostService.listReplies`'s doc comment for why this is BFS-in-memory rather than a recursive CTE                   |
| `EditPost`    | MVP — **planned**, not yet in `posts.proto`                                                                                                                                                                                                                                                                                           |
| `Repost`      | possible later; **quote-posts are explicitly out of scope**; **planned**                                                                                                                                                                                                                                                              |

`Post.counts.likes`/`viewer_state.liked`/`viewer_state.bookmarked` are real as of P4-002 (previously always zero/false) — computed by `PostService.viewOf`/`feeds/post-batch.ts`'s `toPostViews` from the `likes`/`bookmarks` tables.

### FeedService (§52) — implemented (P3-002)

| RPC              | Notes                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `ListHomeFeed`   | fan-out-on-read, chronological; own posts + posts by followed actors only; requires an authenticated session                          |
| `ListLocalFeed`  | chronological, local public posts; anonymous-callable, but honors a sent bearer token for block/mute/`FOLLOWERS`-visibility filtering |
| `ListActorPosts` | a given actor's posts; same optional-viewer behavior as `ListLocalFeed`                                                               |

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
by actors the viewer follows.

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

### ModerationService (§55, §61–64) — implemented in `moderation.proto` (P6-001/P6-002)

| RPC                           | Notes                                                                                                                                                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BlockActor` / `UnblockActor` | idempotent; blocking removes any existing follow in either direction (§62) and returns the updated `Relationship`                                                                                                                                                           |
| `MuteActor` / `UnmuteActor`   | idempotent; never touches an existing follow (§63); returns the updated `Relationship`                                                                                                                                                                                      |
| `ListBlocks` / `ListMutes`    | the caller's own list, keyset-paginated                                                                                                                                                                                                                                     |
| `ReportPost` / `ReportActor`  | rate-limited (10/hour per network peer, `ReportRateLimitService`); bounded 2,000-character `details`; always creates an `OPEN` `reports` row — resolving a report has no RPC of its own, it's `patches-admin report resolve` (§65, P6-003, `docs/operations/moderation.md`) |

No user-facing RPC exposes internal moderator notes (`reports.moderator_note`), and there is
no gRPC surface for the admin CLI at all — `apps/admin` reads/writes PostgreSQL directly
through `@patches/database`, deliberately bypassing this API contract entirely (see
`docs/operations/moderation.md`).

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

`NotificationsService.notifyFollow`/`notifyLike`/`notifyReply`/`notifyMention` are the write
side, called from `PostService` (REPLY/MENTION) and `ReactionsService` (LIKE) as a side effect
of their own writes — spec §113 has no separate event service. Every notify path skips
self-notification and respects blocks (§62) and mutes (§63) before ever writing a row, and
dedupes via two partial unique indexes on `notifications` (§113). `notifyFollow` exists and is
exported but nothing calls it yet — `GraphService.followActor` is outside this task's file
scope; wiring that one-line call is a follow-up (see this task's report).

No push infrastructure until a mobile client exists — the TUI polls while active and
supports manual refresh.

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
- Creation RPCs (e.g. `CreatePost`) carry a client-generated `client_request_id`
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

| Application error code       | gRPC status           |
| ---------------------------- | --------------------- |
| `AUTH_INVALID_CREDENTIALS`   | `UNAUTHENTICATED`     |
| `AUTH_EMAIL_UNVERIFIED`      | `FAILED_PRECONDITION` |
| `AUTH_SESSION_EXPIRED`       | `UNAUTHENTICATED`     |
| `ACTOR_NOT_FOUND`            | `NOT_FOUND`           |
| `HANDLE_TAKEN`               | `ALREADY_EXISTS`      |
| `ACTOR_BLOCKED`              | `PERMISSION_DENIED`   |
| `POST_NOT_FOUND`             | `NOT_FOUND`           |
| `POST_FORBIDDEN`             | `PERMISSION_DENIED`   |
| `POST_TOO_LONG`              | `INVALID_ARGUMENT`    |
| `PAGE_NOT_FOUND`             | `NOT_FOUND`           |
| `PAGE_FORBIDDEN`             | `PERMISSION_DENIED`   |
| `GUESTBOOK_ENTRY_NOT_FOUND`  | `NOT_FOUND`           |
| `MEDIA_TOO_LARGE`            | `INVALID_ARGUMENT`    |
| `MEDIA_UNSUPPORTED_TYPE`     | `INVALID_ARGUMENT`    |
| `MEDIA_NOT_READY`            | `FAILED_PRECONDITION` |
| `RATE_LIMITED`               | `RESOURCE_EXHAUSTED`  |
| `VALIDATION_ERROR`           | `INVALID_ARGUMENT`    |
| `INTERNAL_ERROR`             | `INTERNAL`            |
| `CLIENT_VERSION_UNSUPPORTED` | `FAILED_PRECONDITION` |
| `NOT_IMPLEMENTED`            | `UNIMPLEMENTED`       |

`AUTH_EMAIL_UNVERIFIED` and `MEDIA_NOT_READY` are mapped to `FAILED_PRECONDITION`
because the request is well-formed but the resource/account is not yet in a state
that permits the action — the canonical gRPC semantics for that status.

`NOT_IMPLEMENTED` is for an RPC that exists in the schema but nothing on this node answers
yet (`BeginGitHubLogin`/`PollGitHubLogin` until Phase 6, §176) — distinct from a client asking
for something malformed, which is `VALIDATION_ERROR`/`INVALID_ARGUMENT`.

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
