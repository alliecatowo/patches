# API contract: Protobuf / gRPC

Patches' canonical client/server application protocol — the contract between a client and a
**node**. Source of truth: `INITIAL_VISION.md` §40–58, §83, and **Amendment A §168, §170,
§174**.

> **Amendment A changed this document.** `AuthService` gains SSH, GitHub-device-flow, and
> credential-management RPCs (§168); a `NodeService` and a `PageService` are added. See
> [`auth.md`](./auth.md) and [`pages.md`](./pages.md).

**Implementation status.** `packages/proto/proto/patches/v1/` currently defines
`common.proto`, `system.proto`, `auth.proto`, `actors.proto`, `posts.proto`, `feeds.proto`,
`social_graph.proto`, `node.proto` — the full `AuthService` (including SSH login, and
credential management) has server handlers; `BeginGitHubLogin`/`PollGitHubLogin` are
schema-defined but their server implementation is deferred to Phase 6 (§176). `PostService`
(`CreatePost`/`GetPost`/`DeletePost`/`ListReplies` — `ListReplies` returns direct replies
only, not yet a depth-bounded tree walk; `CreatePost` also accepts `content_warning`, B-018)
and `ActorService` (`GetActor`/`GetActorByHandle`/`UpdateProfile` — including a bounded
`nameplate`, §173 — `SearchActors`, `ListFollowers`, `ListFollowing`) have server handlers,
all implemented by P3-001. `SocialGraphService` (`social_graph.proto`) has server handlers for
`FollowActor`/`UnfollowActor`/`GetRelationship`; `MuteActor`/`UnmuteActor`/`BlockActor`/
`UnblockActor` remain planned (Phase 6, spec §140) — the `blocks`/`mutes` tables exist (P3-001)
so the feed/relationship reads below already honor them, but nothing writes to them yet.
`FeedService`'s `ListLocalFeed`/`ListActorPosts`/`ListHomeFeed` all have server handlers
(P3-002) with keyset-paginated, visibility+block+mute-aware SQL (§59, §62–63) — see §3's
`FeedService` table for the exact scoping. `NodeService.GetNodeInfo` (`node.proto`) has a
server handler (P1-014). `PageService`, `MediaService`, `ReactionService`,
`ModerationService`, and `NotificationService` — and the MVP-marked RPCs (`EditPost`,
`Repost`, `ListBookmarks`) — are **planned**, not yet present in `packages/proto`. Per-RPC
status is called out inline below.

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
├── pages.proto       # planned
├── posts.proto       # implemented
├── feeds.proto       # implemented
├── social_graph.proto # implemented (FollowActor/UnfollowActor/GetRelationship only)
├── media.proto       # planned
├── moderation.proto  # planned
└── notifications.proto  # planned
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
`BeginGitHubLogin`/`PollGitHubLogin` are schema-only until their Phase 6 server
implementation (§176).

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

### PageService (§170–§172) — planned, not yet in `packages/proto`

**Phase 4.5.** The server stores, validates, versions and serves the page document; it never
renders it.

| RPC             | Notes                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------- |
| `GetPage`       | by actor (+ optional slug); returns the current revision document                           |
| `UpdatePage`    | validated **strictly** against the declared schema version; writes a new immutable revision |
| `ListGuestbook` | cursor-paginated                                                                            |
| `SignGuestbook` | rate-limited (§102); blocked actors rejected; plain text ≤ 500 chars                        |

The document is inert data — no executable user code, in any client, ever (§172). Renderers
ignore unknown block types gracefully; the server rejects them on write.

### ActorService (§49) — implemented in `actors.proto`

| RPC                | Notes                                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetActor`         | by ID; `counts` is real (`followers`/`following` from `follows`, `posts` from `posts`) as of P3-001                                                                                           |
| `GetActorByHandle` |                                                                                                                                                                                               |
| `UpdateProfile`    | `display_name`/`bio`/`location_text`/`website_url`/`nameplate` (§173), selected by a `google.protobuf.FieldMask` (`update_mask`); avatar is not yet a field — added once `MediaService` ships |
| `SearchActors`     | handle prefix (`LIKE`) + display-name match (`ILIKE`) (§112), keyset-paginated on `(created_at DESC, id DESC)`, newest matching actor first — not yet trigram/full-text                       |
| `ListFollowers`    | cursor-paginated on the `follows` row's own `(created_at DESC, id DESC)`; `counts` left zeroed (a list summary, not `GetActor`'s guarantee)                                                   |
| `ListFollowing`    | same as `ListFollowers`, opposite direction                                                                                                                                                   |

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
| `MuteActor`       | **planned** — Phase 6 (spec §140); the `mutes` table exists (P3-001) and is already read by `FeedService`/`GetRelationship`                                                               |
| `UnmuteActor`     | **planned** — Phase 6                                                                                                                                                                     |
| `BlockActor`      | **planned** — Phase 6; will also clear any existing follow in either direction                                                                                                            |
| `UnblockActor`    | **planned** — Phase 6                                                                                                                                                                     |

### PostService (§51) — `CreatePost`/`GetPost`/`DeletePost`/`ListReplies` implemented in `posts.proto`

| RPC           | Notes                                                                       |
| ------------- | --------------------------------------------------------------------------- |
| `CreatePost`  | requires `client_request_id`; idempotent; accepts `content_warning` (B-018) |
| `GetPost`     |                                                                             |
| `DeletePost`  | soft delete / tombstone; returns the tombstoned post                        |
| `ListReplies` | cursor-paginated, bounded depth (`max_depth`)                               |
| `EditPost`    | MVP — **planned**, not yet in `posts.proto`                                 |
| `Repost`      | possible later; **quote-posts are explicitly out of scope**; **planned**    |

### FeedService (§52) — implemented (P3-002)

| RPC              | Notes                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `ListHomeFeed`   | fan-out-on-read, chronological; own posts + posts by followed actors only; requires an authenticated session                          |
| `ListLocalFeed`  | chronological, local public posts; anonymous-callable, but honors a sent bearer token for block/mute/`FOLLOWERS`-visibility filtering |
| `ListActorPosts` | a given actor's posts; same optional-viewer behavior as `ListLocalFeed`                                                               |
| `ListBookmarks`  | MVP                                                                                                                                   |

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

### MediaService (§54) — planned, not yet in `packages/proto`

| RPC                   | Returns                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `BeginMediaUpload`    | media ID, presigned PUT URL, expiration                              |
| `FinalizeMediaUpload` | queues processing (transitions `PENDING_UPLOAD` → `PROCESSING`)      |
| `GetMediaDownload`    | authorized short-lived download URL, dimensions, MIME, thumbnail URL |

### ReactionService (§53) — planned, not yet in `packages/proto`

| RPC                               | Notes                  |
| --------------------------------- | ---------------------- |
| `LikePost` / `UnlikePost`         | required if likes ship |
| `BookmarkPost` / `UnbookmarkPost` | bookmarks are private  |

### ModerationService (§55) — planned, not yet in `packages/proto`

| RPC           | Notes |
| ------------- | ----- |
| `ReportPost`  |       |
| `ReportActor` |       |

No user-facing RPC exposes internal moderator notes.

### NotificationService (§56) — planned, not yet in `packages/proto`

| RPC                        | Notes            |
| -------------------------- | ---------------- |
| `ListNotifications`        | cursor-paginated |
| `MarkNotificationRead`     |                  |
| `MarkAllNotificationsRead` |                  |

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
