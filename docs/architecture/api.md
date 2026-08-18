# API contract: Protobuf / gRPC

Patches' canonical client/server application protocol. Source of truth:
`INITIAL_VISION.md` §40–58, §83.

## 1. Schema layout

Protocol Buffers, proto3, package `patches.v1`:

```text
packages/proto/proto/patches/v1/
├── common.proto
├── auth.proto
├── users.proto
├── actors.proto
├── posts.proto
├── feeds.proto
├── media.proto
├── moderation.proto
└── notifications.proto
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

### AuthService (§48)

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

### ActorService (§49)

| RPC                | Notes                                        |
| ------------------ | -------------------------------------------- |
| `GetActor`         | by ID                                        |
| `GetActorByHandle` |                                              |
| `UpdateProfile`    | display name, bio, location, website, avatar |
| `SearchActors`     | handle prefix + display-name match (§112)    |
| `ListFollowers`    | cursor-paginated                             |
| `ListFollowing`    | cursor-paginated                             |

### SocialGraphService (§50)

| RPC             | Notes                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `FollowActor`   | v0 local accounts transition straight to `FOLLOWING`; `PENDING`/`NONE` states reserved for future use |
| `UnfollowActor` |                                                                                                       |
| `MuteActor`     |                                                                                                       |
| `UnmuteActor`   |                                                                                                       |
| `BlockActor`    | also clears any existing follow in either direction                                                   |
| `UnblockActor`  |                                                                                                       |

### PostService (§51)

| RPC           | Notes                                                       |
| ------------- | ----------------------------------------------------------- |
| `CreatePost`  | requires `client_request_id`; idempotent                    |
| `GetPost`     |                                                             |
| `DeletePost`  | soft delete / tombstone                                     |
| `ListReplies` | cursor-paginated, bounded depth                             |
| `EditPost`    | MVP                                                         |
| `Repost`      | possible later; **quote-posts are explicitly out of scope** |

### FeedService (§52)

| RPC              | Notes                             |
| ---------------- | --------------------------------- |
| `ListHomeFeed`   | fan-out-on-read, chronological    |
| `ListLocalFeed`  | chronological, local public posts |
| `ListActorPosts` | a given actor's posts             |
| `ListBookmarks`  | MVP                               |

Explicitly never added: `GetRecommendedFeed`, `GetForYouFeed` (§52, §153).

### MediaService (§54)

| RPC                   | Returns                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `BeginMediaUpload`    | media ID, presigned PUT URL, expiration                              |
| `FinalizeMediaUpload` | queues processing (transitions `PENDING_UPLOAD` → `PROCESSING`)      |
| `GetMediaDownload`    | authorized short-lived download URL, dimensions, MIME, thumbnail URL |

### ReactionService (§53)

| RPC                               | Notes                  |
| --------------------------------- | ---------------------- |
| `LikePost` / `UnlikePost`         | required if likes ship |
| `BookmarkPost` / `UnbookmarkPost` | bookmarks are private  |

### ModerationService (§55)

| RPC           | Notes |
| ------------- | ----- |
| `ReportPost`  |       |
| `ReportActor` |       |

No user-facing RPC exposes internal moderator notes.

### NotificationService (§56)

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

| Application error code     | gRPC status           |
| -------------------------- | --------------------- |
| `AUTH_INVALID_CREDENTIALS` | `UNAUTHENTICATED`     |
| `AUTH_EMAIL_UNVERIFIED`    | `FAILED_PRECONDITION` |
| `AUTH_SESSION_EXPIRED`     | `UNAUTHENTICATED`     |
| `ACTOR_NOT_FOUND`          | `NOT_FOUND`           |
| `HANDLE_TAKEN`             | `ALREADY_EXISTS`      |
| `ACTOR_BLOCKED`            | `PERMISSION_DENIED`   |
| `POST_NOT_FOUND`           | `NOT_FOUND`           |
| `POST_FORBIDDEN`           | `PERMISSION_DENIED`   |
| `POST_TOO_LONG`            | `INVALID_ARGUMENT`    |
| `MEDIA_TOO_LARGE`          | `INVALID_ARGUMENT`    |
| `MEDIA_UNSUPPORTED_TYPE`   | `INVALID_ARGUMENT`    |
| `MEDIA_NOT_READY`          | `FAILED_PRECONDITION` |
| `RATE_LIMITED`             | `RESOURCE_EXHAUSTED`  |
| `VALIDATION_ERROR`         | `INVALID_ARGUMENT`    |
| `INTERNAL_ERROR`           | `INTERNAL`            |

`AUTH_EMAIL_UNVERIFIED` and `MEDIA_NOT_READY` are mapped to `FAILED_PRECONDITION`
because the request is well-formed but the resource/account is not yet in a state
that permits the action — the canonical gRPC semantics for that status.

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
