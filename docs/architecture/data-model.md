# Data model

PostgreSQL schema for a Patches **node**. Source of truth: `INITIAL_VISION.md` §14–27, §36,
§61–66, §113, §12–13, the invite/credential/reaction tables implied throughout §34–39 and
§53, and **Amendment A §163–§173** (credentials, portability seam, pages, nameplates).

> **Amendment A changed this document.** `users.password_hash` is gone (superseded by
> `credentials`, §165), email is now nullable recovery-only, and `actors` gains portability
> and nameplate columns. See ADR
> [0011](../decisions/0011-credentials-separate-from-identity.md) and ADR
> [0012](../decisions/0012-patches-pages-portable-declarative.md).

> **Status markers.** Each table section below is marked `Status: implemented` (there is a
> reviewed TypeORM migration for it) or `Status: planned` (described here ahead of the
> migration that creates it). As of
> `packages/database/src/migrations/1787059787165-ActorRegistrationIdempotency.ts` (which
> follows `1787058326261-Phase4Interactions.ts`, `1787055340075-Phase3SocialGraph.ts`, and
> `1787036506325-Phase1Schema.ts`), the
> **implemented** tables are: `app_meta`, `users`, `actors`, `credentials`,
> `ssh_login_challenges`, `auth_codes`, `refresh_tokens`, `invites`, `outbox_jobs`, `media`,
> `posts`, `post_media`, `follows`, `blocks`, `mutes`, `likes`, `bookmarks`, `notifications`,
> `reports` — see `packages/database/src/entities/index.ts`'s `ALL_ENTITIES`. Everything else in
> this document (`admin_audit_log`, and the
> `pages`/`page_revisions`/`page_assets`/`guestbook_entries` group) is **planned** — Phase 4.5
> for Pages, Phase 6 for `admin_audit_log`.

## Conventions

- Naming: `snake_case` for tables, columns, indexes, constraints (§17). TypeScript
  code uses `camelCase`; do not let ORM defaults introduce inconsistent naming.
- Primary keys: `uuid` for every externally meaningful entity (users, actors, posts,
  media, reports, notifications, etc.). Internal queue/outbox records may use
  `bigint` (§18). Sequential database IDs are never exposed as public social
  identifiers.
- Timestamps: `timestamptz` throughout (`created_at`, `updated_at`, and friends).
- ORM: TypeORM, Data Mapper style. `synchronize: false`, `migrationsRun: false` in
  every environment; schema changes ship as reviewed migrations (§16.1–16.2).
- Soft deletion is used for posts, actors, media (tombstoning) — not hard deletes —
  to preserve thread integrity, moderation audit trail, and future federation
  `Delete` semantics (§25).

## Entity-relationship diagram

```mermaid
erDiagram
    USERS ||--o{ CREDENTIALS : "authenticates with"
    USERS ||--|| ACTORS : "has"
    ACTORS ||--o{ POSTS : "authors"
    ACTORS ||--o{ MEDIA : "owns"
    POSTS ||--o{ POST_MEDIA : "attaches"
    MEDIA ||--o{ POST_MEDIA : "attached via"
    POSTS ||--o{ POSTS : "replies to (in_reply_to_id)"
    ACTORS ||--o{ FOLLOWS : "follower"
    ACTORS ||--o{ FOLLOWS : "followee"
    ACTORS ||--o{ BLOCKS : "blocker"
    ACTORS ||--o{ BLOCKS : "blocked"
    ACTORS ||--o{ MUTES : "muter"
    ACTORS ||--o{ MUTES : "muted"
    ACTORS ||--o{ LIKES : "likes"
    POSTS ||--o{ LIKES : "liked by"
    ACTORS ||--o{ BOOKMARKS : "bookmarks"
    POSTS ||--o{ BOOKMARKS : "bookmarked"
    ACTORS ||--o{ REPORTS : "reports (as reporter)"
    ACTORS ||--o{ REPORTS : "is subject of (actor)"
    POSTS ||--o{ REPORTS : "is subject of (post)"
    USERS ||--o{ REFRESH_TOKENS : "sessions"
    USERS ||--o{ AUTH_CODES : "verification/reset"
    ACTORS ||--o{ NOTIFICATIONS : "receives"
    ACTORS ||--o{ NOTIFICATIONS : "triggers (actor)"
    USERS ||--o{ ADMIN_AUDIT_LOG : "performs (as admin)"
    USERS ||--o{ INVITES : "creates"
    ACTORS ||--|| PAGES : "publishes"
    PAGES ||--o{ PAGE_REVISIONS : "versions"
    PAGES ||--o{ PAGE_ASSETS : "attaches"
    PAGES ||--o{ GUESTBOOK_ENTRIES : "collects"

    USERS {
        uuid id PK
        uuid actor_id FK
        text recovery_email
        text recovery_email_normalized
        timestamptz email_verified_at
        text status
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }
    CREDENTIALS {
        uuid id PK
        uuid user_id FK
        text type
        text identifier
        text secret_hash
        text public_material
        jsonb metadata
        text label
        timestamptz created_at
        timestamptz last_used_at
        timestamptz revoked_at
    }
    ACTORS {
        uuid id PK
        uuid user_id FK
        text handle
        text handle_normalized
        text display_name
        text bio
        text location_text
        text website_url
        uuid avatar_media_id FK
        boolean is_local
        text home_server
        text canonical_uri
        text inbox_uri
        text outbox_uri
        text federation_state
        text moved_to_uri
        jsonb also_known_as
        jsonb nameplate
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }
    PAGES {
        uuid id PK
        uuid actor_id FK
        uuid current_revision_id FK
        int schema_version
        timestamptz published_at
        timestamptz created_at
        timestamptz updated_at
    }
    PAGE_REVISIONS {
        uuid id PK
        uuid page_id FK
        int revision_number
        jsonb document
        int schema_version
        int byte_size
        uuid created_by_user_id FK
        timestamptz created_at
    }
    PAGE_ASSETS {
        uuid id PK
        uuid page_id FK
        uuid media_id FK
        bigint byte_size
        timestamptz created_at
    }
    GUESTBOOK_ENTRIES {
        uuid id PK
        uuid page_id FK
        uuid author_actor_id FK
        text body
        text status
        timestamptz created_at
        timestamptz deleted_at
    }
    POSTS {
        uuid id PK
        uuid author_actor_id FK
        text body
        text post_type
        text link_url
        text visibility
        uuid in_reply_to_id FK
        uuid root_post_id FK
        text canonical_uri
        text origin_server
        boolean is_local
        uuid client_request_id
        timestamptz created_at
        timestamptz updated_at
        timestamptz edited_at
        timestamptz deleted_at
    }
    MEDIA {
        uuid id PK
        uuid owner_actor_id FK
        text state
        text source_object_key
        text display_object_key
        text thumbnail_object_key
        text mime_type
        int width
        int height
        bigint byte_size
        text alt_text
        text content_hash
        timestamptz created_at
        timestamptz processed_at
        timestamptz deleted_at
    }
    POST_MEDIA {
        uuid post_id FK
        uuid media_id FK
        int position
    }
    FOLLOWS {
        uuid id PK
        uuid follower_actor_id FK
        uuid followee_actor_id FK
        text status
        timestamptz created_at
        timestamptz accepted_at
    }
    BLOCKS {
        uuid blocker_actor_id FK
        uuid blocked_actor_id FK
        timestamptz created_at
    }
    MUTES {
        uuid muter_actor_id FK
        uuid muted_actor_id FK
        timestamptz created_at
    }
    LIKES {
        uuid actor_id FK
        uuid post_id FK
        timestamptz created_at
    }
    BOOKMARKS {
        uuid user_id FK
        uuid post_id FK
        timestamptz created_at
    }
    REPORTS {
        uuid id PK
        uuid reporter_actor_id FK
        text subject_type
        uuid subject_actor_id FK
        uuid subject_post_id FK
        text reason
        text details
        text status
        text moderator_note
        timestamptz created_at
        timestamptz resolved_at
        uuid resolved_by_user_id FK
    }
    REFRESH_TOKENS {
        uuid id PK
        uuid user_id FK
        uuid session_id
        text token_hash
        timestamptz expires_at
        timestamptz used_at
        timestamptz revoked_at
        timestamptz created_at
        text user_agent
    }
    AUTH_CODES {
        uuid id PK
        uuid user_id FK
        text purpose
        text code_hash
        timestamptz expires_at
        timestamptz consumed_at
        int attempts
        timestamptz created_at
    }
    SSH_LOGIN_CHALLENGES {
        uuid id PK
        bytea nonce
        text claimed_handle
        text purpose
        uuid bound_user_id
        text bound_fingerprint
        timestamptz expires_at
        timestamptz consumed_at
        timestamptz created_at
    }
    NOTIFICATIONS {
        uuid id PK
        uuid user_id FK
        text type
        uuid actor_id FK
        uuid post_id FK
        timestamptz read_at
        timestamptz created_at
    }
    ADMIN_AUDIT_LOG {
        uuid id PK
        uuid admin_user_id FK
        text action
        text subject_type
        uuid subject_id
        jsonb metadata
        timestamptz created_at
    }
    INVITES {
        uuid id PK
        text code_hash
        text note
        uuid created_by_user_id FK
        int max_uses
        int uses
        timestamptz expires_at
        timestamptz revoked_at
        timestamptz created_at
    }
    OUTBOX_JOBS {
        bigint id PK
        text idempotency_key
        text type
        jsonb payload
        text status
        int attempts
        int max_attempts
        timestamptz available_at
        timestamptz locked_at
        text locked_by
        text last_error
        timestamptz created_at
        timestamptz completed_at
    }
    APP_META {
        text key PK
        jsonb value
        timestamptz updated_at
    }
```

`app_meta` has no foreign keys — it is schema-level key/value bookkeeping (e.g. a generated
`instance_id`), not part of the social graph, so it is omitted from the relationship lines
above.

---

## `users`

**Status: implemented**

A local authenticated account (§20, as amended by §165). Distinct from `actors` — federation
introduces remote actors with no local `User` (§19). **Credentials live in `credentials`, not
here**: `password_hash` was removed by Amendment A, and email is now optional recovery data
rather than the account identifier.

| Column                      | Type          | Nullable | Notes                                  |
| --------------------------- | ------------- | -------- | -------------------------------------- |
| `id`                        | `uuid`        | no       | PK                                     |
| `actor_id`                  | `uuid`        | no       | FK → `actors.id`, unique               |
| `recovery_email`            | `text`        | yes      | as entered; recovery/verification only |
| `recovery_email_normalized` | `text`        | yes      | lowercased/normalized for uniqueness   |
| `email_verified_at`         | `timestamptz` | yes      | null until verified                    |
| `status`                    | `text` (enum) | no       | `ACTIVE` \| `SUSPENDED` \| `DELETED`   |
| `created_at`                | `timestamptz` | no       |                                        |
| `updated_at`                | `timestamptz` | no       |                                        |
| `deleted_at`                | `timestamptz` | yes      | soft delete                            |

**Constraints**: `UNIQUE (recovery_email_normalized) WHERE recovery_email_normalized IS NOT
NULL`. `actor_id` unique (1:1 with `actors`).

**Indexes**: partial unique index on `recovery_email_normalized`; index on `actor_id`.

**Email policy** (§165): required and verified when the user's only credential is
`PASSWORD` (otherwise password reset has no channel); optional when the user holds a
non-password credential; a node may require it by policy. See
[`auth.md`](./auth.md) §8.

---

## `credentials`

**Status: implemented**

A way to prove you are a user — **not** an identity (§165, ADR 0011). Adding, rotating, or
revoking one never changes the actor, the handle, or any social relationship.

| Column            | Type          | Nullable | Notes                                                                   |
| ----------------- | ------------- | -------- | ----------------------------------------------------------------------- |
| `id`              | `uuid`        | no       | PK                                                                      |
| `user_id`         | `uuid`        | no       | FK → `users.id`                                                         |
| `type`            | `text` (enum) | no       | `PASSWORD` \| `SSH_PUBLIC_KEY` \| `GITHUB` (`PASSKEY` reserved, not v0) |
| `identifier`      | `text`        | yes      | type-scoped lookup key; see below                                       |
| `secret_hash`     | `text`        | yes      | Argon2id hash, `PASSWORD` only (§34). **Never logged, never in a DTO.** |
| `public_material` | `text`        | yes      | OpenSSH public key blob, `SSH_PUBLIC_KEY` only. Public, safe to return. |
| `metadata`        | `jsonb`       | yes      | non-secret provider bookkeeping (key type, GitHub login for display)    |
| `label`           | `text`        | yes      | user-supplied ("work laptop")                                           |
| `created_at`      | `timestamptz` | no       |                                                                         |
| `last_used_at`    | `timestamptz` | yes      |                                                                         |
| `revoked_at`      | `timestamptz` | yes      | revocation is soft; rows are retained for audit                         |

`identifier` by type:

| Type             | `identifier`                                                                   |
| ---------------- | ------------------------------------------------------------------------------ |
| `SSH_PUBLIC_KEY` | key fingerprint, OpenSSH `SHA256:<base64>` form                                |
| `GITHUB`         | GitHub **numeric account id** — never the login name (mutable, reusable, §167) |
| `PASSWORD`       | `NULL` — login resolves the user by handle or verified recovery email first    |

**Constraints**:

```sql
UNIQUE (user_id)         WHERE type = 'PASSWORD' AND revoked_at IS NULL
UNIQUE (type, identifier) WHERE revoked_at IS NULL AND identifier IS NOT NULL
```

**Service-layer invariants** (not expressible as constraints): revoking the last active
credential MUST fail; adding a credential MUST require an authenticated session;
`ListCredentials` returns type, label, identifier, `created_at`, `last_used_at` and **never**
`secret_hash`.

---

## `ssh_login_challenges`

**Status: implemented**

Server-issued nonces for SSH challenge/response login (§166,
[`auth.md`](./auth.md) §4).

| Column              | Type          | Nullable | Notes                                                      |
| ------------------- | ------------- | -------- | ---------------------------------------------------------- |
| `id`                | `uuid`        | no       | PK; the challenge id bound into the signed blob            |
| `nonce`             | `bytea`       | no       | ≥ 32 bytes from a CSPRNG                                   |
| `claimed_handle`    | `text`        | yes      | set only when the client claims a handle (login only)      |
| `purpose`           | `text`        | no       | `LOGIN` (default) or `ENROLL` (CHECK constraint, B-025)    |
| `bound_user_id`     | `uuid`        | yes      | enrollment only: the user this proof may be redeemed for   |
| `bound_fingerprint` | `text`        | yes      | enrollment only: the fingerprint of the key being enrolled |
| `expires_at`        | `timestamptz` | no       | TTL ≤ 120 seconds                                          |
| `consumed_at`       | `timestamptz` | yes      | single-use; consumed atomically                            |
| `created_at`        | `timestamptz` | no       |                                                            |

Expired rows are swept by a periodic job. Challenges are issued regardless of whether any
supplied fingerprint is enrolled — see the no-enumeration rule in §166.

---

## `actors`

**Status: implemented**

A social identity — local or (later) remote (§21).

| Column              | Type          | Nullable | Notes                                                                          |
| ------------------- | ------------- | -------- | ------------------------------------------------------------------------------ |
| `id`                | `uuid`        | no       | PK                                                                             |
| `user_id`           | `uuid`        | yes      | FK → `users.id`, unique; null for remote actors                                |
| `handle`            | `text`        | no       | display-case-preserving                                                        |
| `handle_normalized` | `text`        | no       | lowercase canonical form                                                       |
| `client_request_id` | `uuid`        | yes      | `AuthService.Register`'s idempotency key (§45, A-021); null outside `Register` |
| `display_name`      | `text`        | yes      |                                                                                |
| `bio`               | `text`        | yes      | max 500 chars (§58)                                                            |
| `location_text`     | `text`        | yes      | max 100 chars                                                                  |
| `website_url`       | `text`        | yes      | max 2,048 chars; scheme-validated (§104)                                       |
| `avatar_media_id`   | `uuid`        | yes      | FK → `media.id`                                                                |
| `is_local`          | `boolean`     | no       |                                                                                |
| `home_server`       | `text`        | yes      | remote actors only                                                             |
| `canonical_uri`     | `text`        | yes      | unique; stable production domain required before public federation (§21, §91)  |
| `inbox_uri`         | `text`        | yes      | federation (F1+)                                                               |
| `outbox_uri`        | `text`        | yes      | federation (F1+)                                                               |
| `federation_state`  | `text`        | yes      | federation bookkeeping                                                         |
| `moved_to_uri`      | `text`        | yes      | portability seam (§164); unused until v0.4                                     |
| `also_known_as`     | `jsonb`       | yes      | prior/alternate actor URIs this actor claims (§164); unused until v0.4         |
| `nameplate`         | `jsonb`       | yes      | bounded (≤ 2 KiB) inline identity presentation (§173)                          |
| `created_at`        | `timestamptz` | no       |                                                                                |
| `updated_at`        | `timestamptz` | no       |                                                                                |
| `deleted_at`        | `timestamptz` | yes      | tombstone                                                                      |

**Constraints**: `UNIQUE (handle_normalized)`. `UNIQUE (canonical_uri)` (nullable-safe
unique). `UNIQUE (user_id)`. `UNIQUE (handle_normalized, client_request_id)` (A-021,
nullable-safe — see the column note above; this is a schema-only fix, `AuthService.register`
does not check it yet, see `tasks.md` A-021).

**Indexes**: `actors(handle_normalized)` UNIQUE (§60); `actors(canonical_uri)` UNIQUE;
`actors(handle_normalized, client_request_id)` UNIQUE (A-021).

**Handle rules** (§22): lowercase canonical form, ASCII, letters/digits/underscore,
3–30 characters. No Unicode confusables in v0. Local handles render as `@alice`;
federated handles render as `@alice@example.social`. A handle is unique **within a node**
only — there is no global handle namespace (§163).

**Portability** (§164): an actor with `moved_to_uri` set is read-only — no new posts, no new
follows accepted. A move is honored only when the destination actor claims the origin actor
in `also_known_as`; a one-sided claim is never trusted. Naming note: `movedTo`/`alsoKnownAs`
are Mastodon-originated, non-normative community properties, not standard ActivityStreams —
these columns are ours and are mapped only at the federation boundary.

**Nameplate** (§173): validated at write time against the capabilities the node grants that
user (§174). Badges within it are server-attested only — a user cannot set badge text.

---

## `posts`

**Status: implemented**

Root posts and replies share one table — there is no separate comment entity (§23).

| Column              | Type          | Nullable | Notes                                                                             |
| ------------------- | ------------- | -------- | --------------------------------------------------------------------------------- |
| `id`                | `uuid`        | no       | PK                                                                                |
| `author_actor_id`   | `uuid`        | no       | FK → `actors.id`                                                                  |
| `body`              | `text`        | yes      | max 5,000 Unicode chars (§58); nullable because a link/image-only post is allowed |
| `post_type`         | `text` (enum) | no       | `NOTE` \| `LINK`                                                                  |
| `link_url`          | `text`        | yes      | present when `post_type = LINK`                                                   |
| `visibility`        | `text` (enum) | no       | `PUBLIC` \| `UNLISTED` \| `FOLLOWERS`                                             |
| `content_warning`   | `text`        | yes      | optional click-to-reveal label (B-018); same length budget as `body`              |
| `in_reply_to_id`    | `uuid`        | yes      | FK → `posts.id`; null for root posts                                              |
| `root_post_id`      | `uuid`        | no       | FK → `posts.id`; self for root posts (§24)                                        |
| `canonical_uri`     | `text`        | yes      | unique; federation                                                                |
| `origin_server`     | `text`        | yes      | federation                                                                        |
| `is_local`          | `boolean`     | no       |                                                                                   |
| `client_request_id` | `uuid`        | yes      | idempotency key (§45)                                                             |
| `created_at`        | `timestamptz` | no       |                                                                                   |
| `updated_at`        | `timestamptz` | no       |                                                                                   |
| `edited_at`         | `timestamptz` | yes      | set on edit; original `created_at` preserved (§26)                                |
| `deleted_at`        | `timestamptz` | yes      | tombstone; body/media withheld from clients, renders `[deleted]` (§25)            |

**Constraints**:

- `CHECK`: post has at least one of `body`, an attached `post_media` row, or
  `link_url` (enforced at service layer; a DB-level check on media requires a
  cross-table trigger and MAY be added later — see §23).
- `UNIQUE (canonical_uri)`.
- `UNIQUE (author_actor_id, client_request_id)` where `client_request_id IS NOT NULL`
  — idempotent creation under retry (§45).

**Indexes** (§60):

- `posts(author_actor_id, created_at DESC, id DESC)`
- `posts(created_at DESC, id DESC)`
- `posts(root_post_id, created_at, id)`
- `posts(in_reply_to_id, created_at, id)`

**Thread representation** (§24): `root_post_id` avoids recursively walking upward to
find the thread root. A root post has `in_reply_to_id = NULL` and
`root_post_id = id`. Thread retrieval is bounded-depth and paginated — never load an
arbitrarily large thread in one request.

---

## `media`

**Status: implemented**

| Column                 | Type          | Nullable | Notes                                                                |
| ---------------------- | ------------- | -------- | -------------------------------------------------------------------- |
| `id`                   | `uuid`        | no       | PK                                                                   |
| `owner_actor_id`       | `uuid`        | no       | FK → `actors.id`                                                     |
| `state`                | `text` (enum) | no       | `PENDING_UPLOAD` \| `PROCESSING` \| `READY` \| `FAILED` \| `DELETED` |
| `source_object_key`    | `text`        | yes      | R2 key for the original upload                                       |
| `display_object_key`   | `text`        | yes      | R2 key for the processed display derivative                          |
| `thumbnail_object_key` | `text`        | yes      | R2 key for the thumbnail derivative                                  |
| `mime_type`            | `text`        | yes      | server-verified, never trusted from client                           |
| `width`                | `int`         | yes      | decoded, not client-supplied                                         |
| `height`               | `int`         | yes      | decoded, not client-supplied                                         |
| `byte_size`            | `bigint`      | yes      |                                                                      |
| `alt_text`             | `text`        | yes      | max 1,000 chars (§58)                                                |
| `content_hash`         | `text`        | yes      | dedup/integrity                                                      |
| `created_at`           | `timestamptz` | no       |                                                                      |
| `processed_at`         | `timestamptz` | yes      |                                                                      |
| `deleted_at`           | `timestamptz` | yes      |                                                                      |

**Indexes**: `media(owner_actor_id, created_at)` (§60).

See `docs/architecture/media.md` for the full state machine and processing pipeline.

---

## `post_media`

**Status: implemented**

Join table between posts and media (§27).

| Column     | Type   | Nullable | Notes                                         |
| ---------- | ------ | -------- | --------------------------------------------- |
| `post_id`  | `uuid` | no       | FK → `posts.id`                               |
| `media_id` | `uuid` | no       | FK → `media.id`                               |
| `position` | `int`  | no       | 0-based ordering, max 4 images per post (§28) |

**Constraints**: `UNIQUE (post_id, media_id)`. `UNIQUE (post_id, position)`.

---

## `follows`

**Status: implemented** (`Phase3SocialGraph1787055340075`, P3-001)

| Column              | Type          | Nullable | Notes                                                                                                                                                   |
| ------------------- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | `uuid`        | no       | PK                                                                                                                                                      |
| `follower_actor_id` | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE`                                                                                                                   |
| `followee_actor_id` | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE`                                                                                                                   |
| `status`            | `text` (enum) | no       | `PENDING` \| `FOLLOWING` (§50) — v0 local accounts transition straight to `FOLLOWING`; `NONE` is represented by the row's _absence_, not a stored value |
| `created_at`        | `timestamptz` | no       |                                                                                                                                                         |
| `accepted_at`       | `timestamptz` | yes      | set when status becomes `FOLLOWING`; null while `PENDING` (unreachable in v0)                                                                           |

**Constraints**: `UNIQUE (follower_actor_id, followee_actor_id)`; `CHECK (follower_actor_id <> followee_actor_id)` (no self-follow).

**Indexes** (§60): `follows(follower_actor_id, followee_actor_id)` UNIQUE;
`follows(follower_actor_id, created_at, id)` (`ListFollowing`'s keyset); `follows(followee_actor_id, created_at, id)` (`ListFollowers`'s keyset, the reverse direction).

**RPCs**: `SocialGraphService.FollowActor`/`UnfollowActor`/`GetRelationship` (implemented, P3-001); `ActorService.ListFollowers`/`ListFollowing` (implemented, P3-001).

---

## `blocks`

**Status: implemented** (`Phase3SocialGraph1787055340075`, P3-001) — no RPC writes to this table yet

| Column             | Type          | Nullable | Notes                                 |
| ------------------ | ------------- | -------- | ------------------------------------- |
| `blocker_actor_id` | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE` |
| `blocked_actor_id` | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE` |
| `created_at`       | `timestamptz` | no       |                                       |

**Constraints**: composite PK `(blocker_actor_id, blocked_actor_id)` (also serves as the §60 unique constraint); `CHECK (blocker_actor_id <> blocked_actor_id)` (no self-block).

**Block semantics** (§62): if A blocks B — B cannot follow A (existing follow is
removed/ignored); A does not see B in normal feeds; B cannot see A through
authenticated normal API surfaces; B cannot interact with A's posts; notifications
respect the block. Public-data limitations under federation are documented
separately once public web endpoints exist.

**Implementation note**: the table and its read paths (`FeedService`'s block-aware SQL,
`SocialGraphService.FollowActor`'s block check, `GetRelationship.blocking`) landed in P3-001/
P3-002 ahead of the table's own write RPCs — `BlockActor`/`UnblockActor` are Phase 6 (spec
§140). Nothing populates this table yet outside of test fixtures.

---

## `mutes`

**Status: implemented** (`Phase3SocialGraph1787055340075`, P3-001) — no RPC writes to this table yet

| Column           | Type          | Nullable | Notes                                 |
| ---------------- | ------------- | -------- | ------------------------------------- |
| `muter_actor_id` | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE` |
| `muted_actor_id` | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE` |
| `created_at`     | `timestamptz` | no       |                                       |

**Constraints**: composite PK `(muter_actor_id, muted_actor_id)` (also serves as the §60 unique constraint); `CHECK (muter_actor_id <> muted_actor_id)` (no self-mute).

**Mute semantics** (§63): does not notify the muted user; does not remove the follow
relationship automatically; hides the muted actor's posts from the muter's home feed;
suppresses notifications from the muted actor per product policy.

**Implementation note**: same status as `blocks` above — the table and `FeedService`'s
mute-aware SQL / `GetRelationship.muting` landed in P3-001/P3-002; `MuteActor`/`UnmuteActor`
are Phase 6.

---

## `likes`

**Status: implemented** (`Phase4Interactions1787058326261`, P4-002)

| Column       | Type          | Nullable | Notes                                 |
| ------------ | ------------- | -------- | ------------------------------------- |
| `actor_id`   | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE` |
| `post_id`    | `uuid`        | no       | FK → `posts.id`, `ON DELETE CASCADE`  |
| `created_at` | `timestamptz` | no       |                                       |

**Constraints**: composite PK `(actor_id, post_id)` (also serves as the §60 unique
constraint — this is what makes `LikePost`/`UnlikePost` idempotent).

**Indexes** (§60): `likes(post_id, created_at, actor_id)` — backs
`ReactionService.ListPostLikers`'s keyset pagination of a single post's likers, newest first.

---

## `bookmarks`

**Status: implemented** (`Phase4Interactions1787058326261`, P4-002)

Private saved posts (§53) — `ListBookmarks` only ever returns the caller's own.

| Column       | Type          | Nullable | Notes                                 |
| ------------ | ------------- | -------- | ------------------------------------- |
| `actor_id`   | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE` |
| `post_id`    | `uuid`        | no       | FK → `posts.id`, `ON DELETE CASCADE`  |
| `created_at` | `timestamptz` | no       |                                       |

**Constraints**: composite PK `(actor_id, post_id)` (also serves as the §60 unique
constraint). Keyed by `actor_id`, not `user_id` as an earlier draft of this document
sketched — every other social table in this schema (`likes`, `follows`, `blocks`, `mutes`) is
actor-keyed, and there is no reason for bookmarks alone to break that pattern given every v0
actor has exactly one user.

**Indexes** (§60): `bookmarks(actor_id, created_at, post_id)` — backs `ListBookmarks`'s
keyset pagination.

---

## `reports`

**Status: implemented** (`Phase4Interactions1787058326261`, P6-002)

| Column                | Type          | Nullable | Notes                                                                                      |
| --------------------- | ------------- | -------- | ------------------------------------------------------------------------------------------ |
| `id`                  | `uuid`        | no       | PK                                                                                         |
| `reporter_actor_id`   | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE`                                                      |
| `subject_type`        | `text` (enum) | no       | `ACTOR` \| `POST`                                                                          |
| `subject_actor_id`    | `uuid`        | yes      | FK → `actors.id`; set when `subject_type = ACTOR`                                          |
| `subject_post_id`     | `uuid`        | yes      | FK → `posts.id`; set when `subject_type = POST`                                            |
| `reason`              | `text` (enum) | no       | `SPAM` \| `HARASSMENT` \| `HATE_SPEECH` \| `ILLEGAL_CONTENT` \| `IMPERSONATION` \| `OTHER` |
| `details`             | `text`        | yes      | free text, max 2,000 characters (service-enforced)                                         |
| `status`              | `text` (enum) | no       | `OPEN` \| `REVIEWING` \| `RESOLVED` \| `DISMISSED`, default `OPEN`                         |
| `moderator_note`      | `text`        | yes      | never exposed via user-facing API (§55); admin CLI only                                    |
| `created_at`          | `timestamptz` | no       |                                                                                            |
| `resolved_at`         | `timestamptz` | yes      | admin CLI only — no RPC in this task's scope sets it                                       |
| `resolved_by_user_id` | `uuid`        | yes      | FK → `users.id`, `ON DELETE SET NULL`; admin CLI only                                      |

**Constraints**: `CHECK` on `subject_type`/`reason`/`status` against the enums above, plus a
`CHECK` that exactly one of `subject_actor_id`/`subject_post_id` is set, matching
`subject_type`.

**Indexes**: `reports(status, created_at)` (admin listing), `reports(subject_actor_id)`,
`reports(subject_post_id)`.

Reported content is never auto-deleted merely because it was reported (§64).
`ModerationService.ReportPost`/`ReportActor` only ever insert an `OPEN` row —
`moderator_note`/`resolved_at`/`resolved_by_user_id` are written by the admin CLI (§65, out of
this task's scope).

---

## `refresh_tokens`

**Status: implemented**

| Column       | Type          | Nullable | Notes                                                                  |
| ------------ | ------------- | -------- | ---------------------------------------------------------------------- |
| `id`         | `uuid`        | no       | PK                                                                     |
| `user_id`    | `uuid`        | no       | FK → `users.id`                                                        |
| `session_id` | `uuid`        | no       | groups a token family for rotation/reuse detection                     |
| `token_hash` | `text`        | no       | opaque, high-entropy token stored hashed — never plaintext (§36, §153) |
| `expires_at` | `timestamptz` | no       |                                                                        |
| `used_at`    | `timestamptz` | yes      | set when rotated away                                                  |
| `revoked_at` | `timestamptz` | yes      | set on logout / reuse-detected family revocation                       |
| `created_at` | `timestamptz` | no       |                                                                        |
| `user_agent` | `text`        | yes      |                                                                        |

**Indexes**: `refresh_tokens(token_hash)` UNIQUE; `refresh_tokens(user_id, created_at)`;
`refresh_tokens(session_id)`.

**Behavior**: refresh tokens rotate on every refresh. If an already-rotated token is
presented again (reuse), the entire session/token family is revoked (§36).

---

## `auth_codes`

**Status: implemented**

A short-lived, single-use code emailed to a user. Email verification (§38) and password
reset (§39) share this one table, discriminated by `purpose` — the two have identical shape
and identical lifecycle rules, so splitting them into `email_verification_codes` and
`password_reset_codes` (an earlier version of this document) would only duplicate every
expiry, consumption, and throttling query. Applies only to users with a verified
`recovery_email` (§165) — an account without one has no reset channel by design and recovers
by holding a second credential.

| Column        | Type          | Nullable | Notes                                                                     |
| ------------- | ------------- | -------- | ------------------------------------------------------------------------- |
| `id`          | `uuid`        | no       | PK                                                                        |
| `user_id`     | `uuid`        | no       | FK → `users.id`, `ON DELETE CASCADE`                                      |
| `purpose`     | `text` (enum) | no       | `VERIFY_EMAIL` \| `RESET_PASSWORD`                                        |
| `code_hash`   | `text`        | no       | hashed, never plaintext, never logged                                     |
| `expires_at`  | `timestamptz` | no       | short-lived                                                               |
| `consumed_at` | `timestamptz` | yes      | single-use                                                                |
| `attempts`    | `int`         | no       | default `0`; failed-verification counter backs per-code throttling (§102) |
| `created_at`  | `timestamptz` | no       |                                                                           |

**Indexes**: `auth_codes(user_id, purpose, created_at)`; `auth_codes(code_hash)`.

**Constraints**: `CHECK (purpose IN ('VERIFY_EMAIL', 'RESET_PASSWORD'))`.

---

## `notifications`

**Status: implemented** (`Phase4Interactions1787058326261`, P4-003)

| Column               | Type          | Nullable | Notes                                                                  |
| -------------------- | ------------- | -------- | ---------------------------------------------------------------------- |
| `id`                 | `uuid`        | no       | PK                                                                     |
| `recipient_actor_id` | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE` — recipient                      |
| `type`               | `text` (enum) | no       | `FOLLOW` \| `LIKE` \| `REPLY` \| `MENTION` \| `MODERATION` (§113, §56) |
| `actor_id`           | `uuid`        | yes      | FK → `actors.id`, `ON DELETE CASCADE` — actor that triggered it        |
| `post_id`            | `uuid`        | yes      | FK → `posts.id`, `ON DELETE CASCADE` — related post, if any            |
| `read_at`            | `timestamptz` | yes      |                                                                        |
| `created_at`         | `timestamptz` | no       |                                                                        |

Recipient is `recipient_actor_id`, not `user_id` as an earlier draft of this document
sketched — same actor-keyed reasoning as `bookmarks` above.

**Indexes** (§60): `notifications(recipient_actor_id, created_at, id)` (`ListNotifications`
keyset), `notifications(recipient_actor_id, read_at)` (`GetUnreadCount`).

**Deduplication** (§113 — "a user should not receive 74 identical notifications because a
worker retried"): enforced at two layers. `NotificationsService` checks-then-inserts inside
its transaction; two **partial** unique indexes are the database backstop —
`(recipient_actor_id, type, actor_id, post_id) WHERE post_id IS NOT NULL` and
`(recipient_actor_id, type, actor_id) WHERE post_id IS NULL`. Split in two because a plain
unique index cannot dedupe rows where `post_id IS NULL` (every `FOLLOW` notification) —
PostgreSQL treats `NULL <> NULL`, so a single index across all four columns would never catch
two identical `FOLLOW` notifications.

---

## `admin_audit_log`

**Status: planned**

| Column          | Type          | Nullable | Notes                                                               |
| --------------- | ------------- | -------- | ------------------------------------------------------------------- |
| `id`            | `uuid`        | no       | PK                                                                  |
| `admin_user_id` | `uuid`        | no       | FK → `users.id`                                                     |
| `action`        | `text`        | no       | e.g. `USER_SUSPEND`, `POST_REMOVE`, `INVITE_CREATE`                 |
| `subject_type`  | `text`        | no       | e.g. `USER`, `POST`, `REPORT`, `INVITE`                             |
| `subject_id`    | `uuid`        | no       |                                                                     |
| `metadata`      | `jsonb`       | yes      | never contains passwords, tokens, or reset/verification codes (§66) |
| `created_at`    | `timestamptz` | no       |                                                                     |

Every `patches-admin` mutating command writes an audit record (§65–66).

---

## `invites`

**Status: implemented**

Referenced by §38 (invite-only registration) and §65 (`invite create` / `invite
list` admin commands); shape inferred from those requirements.

| Column               | Type          | Nullable | Notes                                             |
| -------------------- | ------------- | -------- | ------------------------------------------------- |
| `id`                 | `uuid`        | no       | PK                                                |
| `code_hash`          | `text`        | no       | invite code stored hashed, compared on redemption |
| `created_by_user_id` | `uuid`        | no       | FK → `users.id`                                   |
| `max_uses`           | `int`         | no       | default `1`, adjustable                           |
| `uses`               | `int`         | no       | default `0`                                       |
| `expires_at`         | `timestamptz` | yes      |                                                   |
| `revoked_at`         | `timestamptz` | yes      |                                                   |
| `created_at`         | `timestamptz` | no       |                                                   |

**Constraints**: `CHECK (uses >= 0 AND max_uses >= 1 AND uses <= max_uses)`.

**Indexes**: `invites(code_hash)` UNIQUE; `invites(created_by_user_id, created_at)`.

---

## `outbox_jobs`

**Status: implemented**

Durable job/outbox table backing background work and the transactional outbox
pattern (§12–13). Application mutations that require durable async follow-up (e.g.
sending a verification email) write the mutation and the outbox row in the **same
transaction**.

| Column            | Type          | Nullable | Notes                                                          |
| ----------------- | ------------- | -------- | -------------------------------------------------------------- |
| `id`              | `bigint`      | no       | PK, identity/sequence                                          |
| `type`            | `text`        | no       | job type, see `jobs.md`                                        |
| `payload`         | `jsonb`       | no       | job-specific data                                              |
| `status`          | `text` (enum) | no       | `PENDING` \| `PROCESSING` \| `COMPLETED` \| `FAILED` \| `DEAD` |
| `attempts`        | `int`         | no       | default `0`                                                    |
| `max_attempts`    | `int`         | no       | default `10`                                                   |
| `available_at`    | `timestamptz` | no       | when the job becomes claimable (used for backoff)              |
| `locked_at`       | `timestamptz` | yes      |                                                                |
| `locked_by`       | `text`        | yes      | worker instance identifier                                     |
| `last_error`      | `text`        | yes      |                                                                |
| `idempotency_key` | `text`        | yes      | optional producer-side dedup key; unique where present         |
| `created_at`      | `timestamptz` | no       |                                                                |
| `completed_at`    | `timestamptz` | yes      |                                                                |

**Constraints**: `CHECK (attempts >= 0 AND max_attempts >= 1)`. `UNIQUE (idempotency_key)`
(nullable-safe unique).

**Indexes** (§60): `outbox_jobs(status, available_at, id)`.

See `docs/architecture/jobs.md` for the claim query, backoff formula, and dead-letter
handling.

---

## `app_meta`

**Status: implemented**

Schema-level key/value metadata (e.g. a generated `instance_id`) — not part of the social
graph. Deliberately the only entity wired up in Phase 0, to prove the `DataSource` /
migration / `snake_case`-naming-strategy plumbing end to end before Phase 1 added the real
entities.

| Column       | Type          | Nullable | Notes                 |
| ------------ | ------------- | -------- | --------------------- |
| `key`        | `text`        | no       | PK                    |
| `value`      | `jsonb`       | no       |                       |
| `updated_at` | `timestamptz` | no       | stamped on every save |

---

## Page tables (§170–§172)

**Status: implemented** (`Phase45Pages1787062912872`, P45-002; `PageService` server handlers
land with P45-003)

Patches Pages are a portable declarative document stored server-side and rendered by clients.
The server never renders. Block vocabulary, limits, and security rules are in
[`pages.md`](./pages.md).

### `pages`

One row per actor — the actor's site, pointing at its current revision. Created lazily on the
actor's first `UpdatePage` call, not at registration.

| Column                | Type          | Nullable | Notes                                                                                                                                                     |
| --------------------- | ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | `uuid`        | no       | PK                                                                                                                                                        |
| `actor_id`            | `uuid`        | no       | FK → `actors.id` `ON DELETE CASCADE`, **unique**                                                                                                          |
| `current_revision_id` | `uuid`        | yes      | FK → `page_revisions.id` `ON DELETE SET NULL`; null only in the brief instant between the row's creation and its first revision insert (same transaction) |
| `visibility`          | `text` (enum) | no       | `PUBLIC` \| `UNLISTED` (default `PUBLIC`) — `posts.visibility`'s vocabulary minus `FOLLOWERS`, which has no meaning for a Page                            |
| `created_at`          | `timestamptz` | no       |                                                                                                                                                           |
| `updated_at`          | `timestamptz` | no       | touched whenever `current_revision_id` is repointed                                                                                                       |

### `page_revisions`

Immutable snapshots — a bad edit is recoverable and moderation has an audit trail. Rows are
never updated or deleted by `PageService`.

| Column                | Type          | Nullable | Notes                                                                                          |
| --------------------- | ------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `id`                  | `uuid`        | no       | PK                                                                                             |
| `page_id`             | `uuid`        | no       | FK → `pages.id` `ON DELETE CASCADE`                                                            |
| `revision_number`     | `int`         | no       | monotonic per page, starting at 1                                                              |
| `document`            | `jsonb`       | no       | the `PatchesPage` document; ≤ 64 KiB serialized                                                |
| `byte_size`           | `int`         | no       | UTF-8 byte size of the serialized document; enforced against the document limit                |
| `created_by_actor_id` | `uuid`        | no       | FK → `actors.id` `ON DELETE CASCADE` — the caller of `UpdatePage`, always the page's own owner |
| `created_at`          | `timestamptz` | no       |                                                                                                |

**Constraints**: `UNIQUE (page_id, revision_number)`. No separate `schema_version` column —
the document's own `version` field (validated on write, §171) is authoritative; nothing reads
schema version off this row.

### `page_assets`

Media attached to a page, counted against `capabilities.maxSiteStorageBytes` (§174). Not yet
written to by anything — `Image`/`Gallery` blocks exist in the schema at Phase 4.5, but
populating this table from them is Phase 5 media-pipeline work (P45-005).

| Column       | Type          | Nullable | Notes                                                             |
| ------------ | ------------- | -------- | ----------------------------------------------------------------- |
| `id`         | `uuid`        | no       | PK                                                                |
| `page_id`    | `uuid`        | no       | FK → `pages.id` `ON DELETE CASCADE`                               |
| `media_id`   | `uuid`        | no       | FK → `media.id` `ON DELETE CASCADE` — always Patches media (§172) |
| `byte_size`  | `bigint`      | no       | denormalized for cheap storage accounting                         |
| `created_at` | `timestamptz` | no       |                                                                   |

**Constraints**: `UNIQUE (page_id, media_id)`. Remote URLs are never referenced — arbitrary
remote media is an SSRF, tracking, and visitor-IP-leak vector (§172).

### `guestbook_entries`

Visitor entries, one guestbook per `page_id` (not per sub-page, see [`pages.md`](./pages.md)
§4). Treated as hostile input (§172).

| Column                | Type          | Nullable | Notes                                                                                                                                         |
| --------------------- | ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | `uuid`        | no       | PK                                                                                                                                            |
| `page_id`             | `uuid`        | no       | FK → `pages.id` `ON DELETE CASCADE`                                                                                                           |
| `author_actor_id`     | `uuid`        | yes      | FK → `actors.id` `ON DELETE SET NULL`; nullable for a future non-local/remote signer — never null for anything `SignGuestbook` itself creates |
| `body`                | `text`        | no       | plain text, ≤ 500 characters, sanitized (control characters/escape sequences stripped)                                                        |
| `created_at`          | `timestamptz` | no       |                                                                                                                                               |
| `removed_at`          | `timestamptz` | yes      | tombstone, not `@DeleteDateColumn` — an owner-removed entry stays distinguishable from one that never existed                                 |
| `removed_by_actor_id` | `uuid`        | yes      | FK → `actors.id` `ON DELETE SET NULL`                                                                                                         |

No `status` enum column — a removed entry is `removed_at IS NOT NULL`; `ListGuestbook`
excludes it. Blocked actors cannot sign (§62). Creation is rate-limited on both peer and actor
(§102) and entries are reportable (§64) via `reports.subject_type = 'GUESTBOOK_ENTRY'`
(`reports.subject_guestbook_entry_id`) rather than a dedicated guestbook-report table.

---

## Amendment B tables (§188–190)

**Status: implemented** (`Phase11SocialDepth1787103400432`, P11-002) — reposts, tags,
communities, direct messages, post edit history, pinned posts, and actor flair, plus three
columns added to `posts`. See ADR-pending Amendment B (`INITIAL_VISION.md` §188–192) for the
product rationale; this section is the schema only.

### `reposts`

A repost is a pointer row, exactly like `likes`/`bookmarks` — never a duplicate of the post's
content (§190).

| Column       | Type          | Nullable | Notes                                                                 |
| ------------ | ------------- | -------- | --------------------------------------------------------------------- |
| `id`         | `uuid`        | no       | PK (unlike `likes`/`bookmarks`, §189 gives this table a surrogate id) |
| `actor_id`   | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE`                                 |
| `post_id`    | `uuid`        | no       | FK → `posts.id`, `ON DELETE CASCADE`                                  |
| `created_at` | `timestamptz` | no       |                                                                       |

**Constraints**: `UNIQUE (actor_id, post_id)` (§189 — this is what makes `RepostPost`/
`UnrepostPost` idempotent).

**Indexes** (§189, plus an `id` tiebreaker beyond §189's literal list for keyset-pagination
correctness — see the entity's doc comment): `reposts(actor_id, created_at, id)`,
`reposts(post_id, created_at, id)`.

---

### `tags`

A hashtag. `name` is the canonical (NFKC-normalized, casefolded) form; `display_name` keeps
the original casing. Deliberately has **no** `post_count` column (§181) — there is no
engagement ranking in this product.

| Column         | Type          | Nullable | Notes                                          |
| -------------- | ------------- | -------- | ---------------------------------------------- |
| `id`           | `uuid`        | no       | PK                                             |
| `name`         | `text`        | no       | canonical form, max 30 chars, ≥1 letter (§188) |
| `display_name` | `text`        | no       | original casing                                |
| `created_at`   | `timestamptz` | no       |                                                |

**Constraints**: `UNIQUE (name)`.

---

### `post_tags`

A post's membership in a tag.

| Column       | Type          | Nullable | Notes                                |
| ------------ | ------------- | -------- | ------------------------------------ |
| `post_id`    | `uuid`        | no       | FK → `posts.id`, `ON DELETE CASCADE` |
| `tag_id`     | `uuid`        | no       | FK → `tags.id`, `ON DELETE CASCADE`  |
| `created_at` | `timestamptz` | no       |                                      |

**Constraints**: composite PK `(post_id, tag_id)`.

**Indexes** (§189): `post_tags(tag_id, created_at, post_id)` — backs `FeedService.ListTagFeed`.

---

### `tag_mutes`

An actor's muted tags — up to 100 (§188), enforced in the service layer.

| Column       | Type          | Nullable | Notes                                 |
| ------------ | ------------- | -------- | ------------------------------------- |
| `actor_id`   | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE` |
| `tag_id`     | `uuid`        | no       | FK → `tags.id`, `ON DELETE CASCADE`   |
| `created_at` | `timestamptz` | no       |                                       |

**Constraints**: composite PK `(actor_id, tag_id)`.

---

### `communities`

A topical community a post may optionally belong to.

| Column                | Type          | Nullable | Notes                                                                                                   |
| --------------------- | ------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `id`                  | `uuid`        | no       | PK                                                                                                      |
| `name`                | `text`        | no       | `[a-z0-9_]`, 3-32 chars (§188), `CHECK` enforced                                                        |
| `display_name`        | `text`        | no       | max 80 chars                                                                                            |
| `description`         | `text`        | no       | default `''`, max 500 chars                                                                             |
| `rules`               | `text`        | no       | default `''`, max 4 KiB                                                                                 |
| `created_by_actor_id` | `uuid`        | no       | FK → `actors.id`, `ON DELETE RESTRICT` — a community outlives nothing about its founder being deletable |
| `is_public`           | `boolean`     | no       | default `true`                                                                                          |
| `created_at`          | `timestamptz` | no       |                                                                                                         |
| `updated_at`          | `timestamptz` | no       |                                                                                                         |

**Constraints**: `UNIQUE (name)`; `CHECK` on `name`'s character grammar.

---

### `community_members`

| Column         | Type          | Nullable | Notes                                      |
| -------------- | ------------- | -------- | ------------------------------------------ |
| `community_id` | `uuid`        | no       | FK → `communities.id`, `ON DELETE CASCADE` |
| `actor_id`     | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE`      |
| `role`         | `text`        | no       | `member` \| `moderator`, default `member`  |
| `joined_at`    | `timestamptz` | no       |                                            |

**Constraints**: composite PK `(community_id, actor_id)`; `CHECK` on `role`.

**Indexes**: `community_members(community_id, joined_at, actor_id)` — not in §189's literal
list, added for `CommunityService.ListCommunityMembers`'s cursor pagination (§190's "every new
list RPC is cursor-paginated").

---

### `community_bans`

No uniqueness beyond the surrogate id (§189 lists none) — an actor can accumulate more than
one ban record across an appeal/re-ban cycle; "is this actor currently banned" is a
service-layer query over the most recent row.

| Column               | Type          | Nullable | Notes                                       |
| -------------------- | ------------- | -------- | ------------------------------------------- |
| `id`                 | `uuid`        | no       | PK                                          |
| `community_id`       | `uuid`        | no       | FK → `communities.id`, `ON DELETE CASCADE`  |
| `actor_id`           | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE`       |
| `reason`             | `text`        | yes      | moderator-facing only, never shown publicly |
| `banned_by_actor_id` | `uuid`        | yes      | FK → `actors.id`, `ON DELETE SET NULL`      |
| `created_at`         | `timestamptz` | no       |                                             |

**Indexes**: `community_bans(community_id, actor_id, created_at)`.

---

### `community_invites`

One of the two new unsolicited-contact vectors (§192, alongside `message_requests`):
rate-limited, block-aware, individually mutable, never auto-joins.

| Column             | Type          | Nullable | Notes                                                    |
| ------------------ | ------------- | -------- | -------------------------------------------------------- |
| `id`               | `uuid`        | no       | PK                                                       |
| `community_id`     | `uuid`        | no       | FK → `communities.id`, `ON DELETE CASCADE`               |
| `inviter_actor_id` | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE`                    |
| `invitee_actor_id` | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE`                    |
| `status`           | `text`        | no       | `pending` \| `accepted` \| `declined`, default `pending` |
| `created_at`       | `timestamptz` | no       |                                                          |

**Constraints** (§189): `UNIQUE (community_id, invitee_actor_id) WHERE status = 'PENDING'` — a
second invite to the same pair is blocked only while the first is still pending; a declined
invite can be re-sent.

**Indexes**: `community_invites(invitee_actor_id, created_at, id)`.

---

### `conversations`

A direct-message conversation (§183.4). Never federated, no media, no link previews (§192).

| Column                | Type          | Nullable | Notes                                                                                  |
| --------------------- | ------------- | -------- | -------------------------------------------------------------------------------------- |
| `id`                  | `uuid`        | no       | PK                                                                                     |
| `kind`                | `text`        | no       | `direct` \| `group`, default `direct`                                                  |
| `security_mode`       | `text`        | no       | immutable `LEGACY_SERVER_VISIBLE` \| `E2EE_V1`; existing rows default to legacy        |
| `created_by_actor_id` | `uuid`        | yes      | FK → `actors.id`, `ON DELETE SET NULL` — a conversation outlives its creator's account |
| `created_at`          | `timestamptz` | no       |                                                                                        |
| `last_message_at`     | `timestamptz` | no       | denormalized, updated on every `SendMessage`, drives `ListConversations`'s ordering    |

---

### `conversation_members`

| Column                 | Type          | Nullable | Notes                                                       |
| ---------------------- | ------------- | -------- | ----------------------------------------------------------- |
| `conversation_id`      | `uuid`        | no       | FK → `conversations.id`, `ON DELETE CASCADE`                |
| `actor_id`             | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE`                       |
| `joined_at`            | `timestamptz` | no       |                                                             |
| `left_at`              | `timestamptz` | yes      | null while still a member                                   |
| `last_read_message_id` | `uuid`        | yes      | no FK — a message can be tombstoned after being marked read |
| `muted`                | `boolean`     | no       | default `false`                                             |

**Constraints**: composite PK `(conversation_id, actor_id)`.

---

### `messages`

Bodies never appear in logs/metrics/traces/errors (§192, enforced at the logging layer, not
here). Soft delete (tombstone), same as `posts`.

| Column            | Type          | Nullable | Notes                                                                          |
| ----------------- | ------------- | -------- | ------------------------------------------------------------------------------ |
| `id`              | `uuid`        | no       | PK                                                                             |
| `conversation_id` | `uuid`        | no       | FK → `conversations.id`, `ON DELETE CASCADE`                                   |
| `sender_actor_id` | `uuid`        | yes      | FK → `actors.id`, `ON DELETE SET NULL` — history outlives the sender's account |
| `body`            | `text`        | no       | max 2,000 chars (§188); empty once tombstoned                                  |
| `created_at`      | `timestamptz` | no       |                                                                                |
| `deleted_at`      | `timestamptz` | yes      | tombstone                                                                      |

**Indexes** (§189): `messages(conversation_id, created_at, id)`.

---

### `message_requests`

The other new unsolicited-contact vector (§192, alongside `community_invites`).

| Column               | Type          | Nullable | Notes                                                       |
| -------------------- | ------------- | -------- | ----------------------------------------------------------- |
| `id`                 | `uuid`        | no       | PK                                                          |
| `sender_actor_id`    | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE`                       |
| `recipient_actor_id` | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE`                       |
| `body`               | `text`        | no       | max 2,000 chars (§188) — same budget as an ordinary message |
| `status`             | `text`        | no       | `pending` \| `accepted` \| `declined`, default `pending`    |
| `created_at`         | `timestamptz` | no       |                                                             |

**Constraints**: `UNIQUE (sender_actor_id, recipient_actor_id) WHERE status = 'PENDING'` — not
in §189's literal column list, but required by §188's "1 pending per (sender, recipient)"
limit, which MUST exist as a database constraint where practical; same partial-unique-index
technique §189 already specifies for `community_invites`.

**Indexes**: `message_requests(recipient_actor_id, created_at, id)`.

---

### `post_edits`

A snapshot of a post's prior state, taken immediately before `EditPost` overwrites it. Up to
20 per post (§188), enforced in the service layer.

| Column                     | Type          | Nullable | Notes                                                                          |
| -------------------------- | ------------- | -------- | ------------------------------------------------------------------------------ |
| `id`                       | `uuid`        | no       | PK                                                                             |
| `post_id`                  | `uuid`        | no       | FK → `posts.id`, `ON DELETE CASCADE`                                           |
| `previous_body`            | `text`        | yes      |                                                                                |
| `previous_content_warning` | `text`        | yes      |                                                                                |
| `previous_media_manifest`  | `jsonb`       | yes      | frozen array of the prior `MediaAttachment`-shaped objects                     |
| `edited_by_actor_id`       | `uuid`        | yes      | FK → `actors.id`, `ON DELETE SET NULL` — history outlives the editor's account |
| `created_at`               | `timestamptz` | no       |                                                                                |

**Indexes** (§189): `post_edits(post_id, created_at, id)`.

---

### `pinned_posts`

| Column       | Type          | Nullable | Notes                                        |
| ------------ | ------------- | -------- | -------------------------------------------- |
| `actor_id`   | `uuid`        | no       | FK → `actors.id`, `ON DELETE CASCADE`        |
| `post_id`    | `uuid`        | no       | FK → `posts.id`, `ON DELETE CASCADE`         |
| `position`   | `smallint`    | no       | 0-2 (§188's 3-pin ceiling), `CHECK` enforced |
| `created_at` | `timestamptz` | no       |                                              |

**Constraints**: composite PK `(actor_id, post_id)`; `CHECK (position BETWEEN 0 AND 2)`.

---

### `actor_flair`

Free-form, allow-listed self-presentation (§192), distinct from `actors`' nameplate columns.
Max 1 KiB serialized (§188) — enforced in the service layer.

| Column       | Type          | Nullable | Notes                                     |
| ------------ | ------------- | -------- | ----------------------------------------- |
| `actor_id`   | `uuid`        | no       | PK, FK → `actors.id`, `ON DELETE CASCADE` |
| `document`   | `jsonb`       | no       | shape owned by the client renderer        |
| `updated_at` | `timestamptz` | no       |                                           |

---

### Columns added to `posts` (§189)

| Column           | Type   | Nullable | Notes                                                                                          |
| ---------------- | ------ | -------- | ---------------------------------------------------------------------------------------------- |
| `quoted_post_id` | `uuid` | yes      | FK → `posts.id`, `ON DELETE SET NULL`; only one level of quote nesting is ever rendered (§188) |
| `quote_policy`   | `text` | no       | `anyone` \| `followers` \| `nobody`, default `anyone`, `CHECK` enforced                        |
| `community_id`   | `uuid` | yes      | FK → `communities.id`, `ON DELETE SET NULL`; immutable after insert (service-layer enforced)   |

**Indexes**: `posts(community_id, created_at, id)` — backs `FeedService.ListCommunityFeed`.

---

## Phase 13: E2EE direct-message tables (ADR 0020)

**Status: implemented (schema only).** These tables exist and are exercised by
`packages/database`'s integration tests, but `E2EE_V1` is not a reachable product capability —
per ADR 0020 §11 this is migration stage 3 ("node protocol behind a disabled capability"), and
every conversation still created today is `LEGACY_SERVER_VISIBLE` (§1.1, enforced by a
`BEFORE UPDATE` trigger on `conversations.security_mode` that rejects any change). No plaintext
body, private/session key, message key, or ratchet state is ever persisted here — see
`packages/database/src/entities/e2ee-privacy.test.ts`, which asserts that by inspecting every
`E2ee*` entity's column metadata. The one narrow, intentional exception is
`e2ee_report_evidence_items.disclosed_plaintext`: content a reporter explicitly selects and
submits (ADR 0020 §9), never written by ordinary message delivery.

| Table                        | Purpose                                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2ee_identity_roots`        | An actor's long-lived Ed25519 messaging-root public key, versioned by `generation`; at most one active (non-rotated) per actor.                      |
| `e2ee_device_identities`     | A root-certified per-device X25519/Ed25519 public key pair and certificate; at most one active (non-revoked) generation per `(actor_id, device_id)`. |
| `e2ee_device_rosters`        | Monotonic, root-signed roster snapshots per actor, chained by `previous_digest`/`digest` (§2).                                                       |
| `e2ee_signed_prekeys`        | Public signed prekeys, rotated every 7 days; at most one active (non-retired) per device.                                                            |
| `e2ee_one_time_prekeys`      | Public one-time X3DH prekeys; consumed rows are kept as anti-replay tombstones, not deleted.                                                         |
| `e2ee_logical_messages`      | Node-visible metadata for one logical fanout — franking commitment/tag, digests, epoch — never a body (§8).                                          |
| `e2ee_mailbox_envelopes`     | One opaque per-recipient-device ciphertext payload per logical message.                                                                              |
| `e2ee_report_evidence`       | Consent/audit metadata for a report that discloses E2EE plaintext (§9): who consented, when, and verification status.                                |
| `e2ee_report_evidence_items` | Up to 11 (position 0–10) explicitly reporter-disclosed plaintext messages plus their franking opening/transcript — see above.                        |

`reports.subject_type` gained `E2EE_MESSAGE` and `reports.subject_e2ee_logical_message_id`
(no FK — evidence must outlive ordinary mailbox/message retention) alongside the pre-existing
`MESSAGE` subject.

**Partial-index naming note**: several tables above intentionally have only _one_ index over a
given column set (e.g. `e2ee_mailbox_envelopes` has no non-partial twin of its
`(recipient_device_identity_id, received_at, id)` index) rather than both a general and a
partial version — `SnakeNamingStrategy.indexName` (`packages/database/src/naming/`) derives an
index's name from its sorted column list only, not its `WHERE` predicate, so two indexes over
the same columns would collide on name. Where two predicates are genuinely both needed (e.g.
"generation" history vs. "active" pointer), they deliberately use different column sets so
`pnpm db:generate` sees no drift.

---

## Required index summary (§60)

```text
actors(handle_normalized) UNIQUE
actors(canonical_uri) UNIQUE

users(recovery_email_normalized) UNIQUE
users(actor_id) UNIQUE

credentials(user_id) UNIQUE WHERE type = 'PASSWORD' AND revoked_at IS NULL
credentials(type, identifier) UNIQUE WHERE revoked_at IS NULL AND identifier IS NOT NULL
credentials(user_id, type)

ssh_login_challenges(expires_at)

auth_codes(user_id, purpose, created_at)
auth_codes(code_hash)

refresh_tokens(token_hash) UNIQUE
refresh_tokens(user_id, created_at)
refresh_tokens(session_id)

invites(code_hash) UNIQUE
invites(created_by_user_id, created_at)

pages(actor_id) UNIQUE
page_revisions(page_id, revision_number) UNIQUE
page_assets(page_id, media_id) UNIQUE
guestbook_entries(page_id, created_at) -- ListGuestbook's keyset order also ties on `id`,
                                          which isn't part of this index (B-follow-up)

posts(author_actor_id, created_at DESC, id DESC)
posts(created_at DESC, id DESC)
posts(root_post_id, created_at, id)
posts(in_reply_to_id, created_at, id)
posts(canonical_uri) UNIQUE
posts(author_actor_id, client_request_id) UNIQUE

post_media(post_id, position) UNIQUE

follows(follower_actor_id, followee_actor_id) UNIQUE
follows(follower_actor_id, created_at)

blocks(blocker_actor_id, blocked_actor_id) UNIQUE
mutes(muter_actor_id, muted_actor_id) UNIQUE

likes(actor_id, post_id) UNIQUE (composite PK)
likes(post_id, created_at, actor_id)

bookmarks(actor_id, post_id) UNIQUE (composite PK)
bookmarks(actor_id, created_at, post_id)

notifications(recipient_actor_id, created_at, id)
notifications(recipient_actor_id, read_at)
notifications(recipient_actor_id, type, actor_id, post_id) UNIQUE WHERE post_id IS NOT NULL
notifications(recipient_actor_id, type, actor_id) UNIQUE WHERE post_id IS NULL

reports(status, created_at)
reports(subject_actor_id)
reports(subject_post_id)

media(owner_actor_id, created_at)

outbox_jobs(status, available_at, id)
outbox_jobs(idempotency_key) UNIQUE
```

Validate with `EXPLAIN ANALYZE` once representative fixture data exists (§60, §126).
Some PostgreSQL-specific index definitions are written directly in migrations rather
than relying on TypeORM decorators (§16.2).

## Idempotency key (§45)

Creation RPCs that could be retried (e.g. `CreatePost`) carry a client-generated
`client_request_id: UUID`. The backend enforces a uniqueness constraint of the shape
`(author_actor_id, client_request_id)` so a retried write cannot duplicate the post.
Reads may retry transient failures freely; writes must not, unless idempotent by
construction.

## Soft-delete / tombstone semantics (§25)

Posts, actors, and media use `deleted_at` rather than row destruction. A deleted
post's body/media are withheld from normal clients and rendered as `[deleted]`; the
row itself persists for thread integrity, moderation audit, and future ActivityPub
`Delete`/tombstone federation. Actual data retention policy is documented separately
in `docs/operations/`.

## Thread representation (§24)

Replies are ordinary `posts` rows — there is no separate comment entity. Each post
stores `in_reply_to_id` (immediate parent, nullable) and `root_post_id` (thread root,
self-referencing for root posts) so thread retrieval never requires a recursive
upward walk. Thread reads are bounded-depth and paginated.
