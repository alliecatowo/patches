# Patches

## Product, Architecture, Engineering, Deployment, and Roadmap Specification

**Status:** authoritative implementation specification  
**Audience:** implementation agent / lead engineer  
**Initial implementation target:** public, deployable v0 followed by portfolio-ready MVP  
**Primary language:** TypeScript  
**Primary client:** terminal UI  
**Primary backend:** NestJS  
**Database ORM:** TypeORM  
**Primary database:** PostgreSQL  
**Primary client/server protocol:** Protocol Buffers + gRPC  
**Initial deployment:** Fly.io + Fly Managed Postgres + Cloudflare R2  
**Future federation:** ActivityPub / Fediverse  
**Future client:** React Native

---

## Amendments

This specification is amended by appending new top-level parts, never by rewriting earlier
sections in place. **Read §162 onward before acting on §0–§161** — where an amendment and an
earlier section disagree, the amendment wins, and the earlier section is annotated in the
amendment's scope table.

- **§162–§177 — Amendment A (2026-08-17):** node model (`patches.social` is the reference
  node, not "the backend"), credentials separated from identity (SSH / password / GitHub),
  Patches Pages, nameplates, capabilities-not-tiers, and a revised release sequence that
  moves federation earlier without moving its security gates.

---

# 0. Instructions to the implementation agent

You are the lead engineer responsible for taking Patches from an empty repository to a functioning, deployed application.

Treat this specification as authoritative.

Do not casually reinterpret major architectural or product decisions.

When this specification says **MUST**, **MUST NOT**, **SHOULD**, or **MAY**, interpret those terms literally:

- **MUST**: required.
- **MUST NOT**: prohibited.
- **SHOULD**: expected unless a concrete engineering reason prevents it.
- **MAY**: optional.

When an implementation detail depends on a library or platform API, consult the **current official documentation before implementing it**. Do not invent API names or copy outdated snippets from memory.

When official documentation disagrees with this specification because a library has materially changed, preserve the architectural intent and document the smallest necessary deviation.

Do not substitute technologies just because another technology is more familiar.

In particular:

- Do **not** replace TypeORM with Prisma, Drizzle, Sequelize, MikroORM, or raw SQL as the general persistence layer.
- Do **not** replace NestJS with Express, Fastify-only, Hono, tRPC, Next.js API routes, or another backend framework.
- Do **not** replace Ink with a Rust/Go/Python TUI framework.
- Do **not** replace PostgreSQL with MongoDB, Firestore, DynamoDB, SQLite, or Supabase APIs.
- Do **not** replace gRPC/Protobuf with GraphQL or tRPC.
- Do **not** introduce Redis, Kafka, NATS, RabbitMQ, Kubernetes, Elasticsearch, Temporal, or a service mesh unless a later milestone explicitly requires one.
- Do **not** implement federation before the centralized product works.
- Do **not** create microservices solely for architectural appearance.
- Do **not** build a browser social client in v0.
- Do **not** implement an engagement-ranked feed.

The goal is a project that demonstrates good judgment, not maximum infrastructure.

When possible, create working vertical slices instead of generating hundreds of empty scaffolding files.

Every phase must leave the repository runnable.

---

# 1. Product summary

Patches is a **terminal-native social network** inspired by:

- old Reddit,
- Tumblr,
- early Instagram,
- MySpace,
- Neocities,
- personal websites,
- indie web culture,
- hacker/terminal culture,
- and the Fediverse.

Its initial defining characteristic is that its **primary first-class client is a TUI**.

Patches is not a joke CLI wrapper around a conventional website.

The terminal application is the actual social application.

The service should feel like an alternate path social media could have taken if it had evolved around:

- people,
- communities,
- chronological feeds,
- user-controlled presentation,
- personal identity,
- open protocols,
- weirdness,
- and small-scale interaction,

instead of around:

- engagement maximization,
- algorithmic ranking,
- infinite video,
- rage amplification,
- influencer metrics,
- advertisements,
- or dark patterns.

The long-term system should support multiple clients consuming the same application protocol:

```text
Patches TUI
    |
    | gRPC / protobuf
    v
Patches backend
    |
    +---- PostgreSQL
    |
    +---- object storage
    |
    +---- background worker
    |
    +---- ActivityPub federation later
    |
    +---- React Native mobile app later
```

The server provides identity, authorization, social data, moderation, persistence, and synchronization.

The **client decides how the user experiences that data**.

That distinction is strategically important.

---

# 2. Product thesis

The core thesis is:

> The server should determine what content a user is authorized to access. It should not determine what content is psychologically optimized to capture that user's attention.

Initially, the primary feed is simply chronological.

Eventually Patches should support client-defined feed rules.

The project should therefore evolve toward:

> **server provides the social graph and content; client provides the algorithm.**

The first implementation of that principle should **not** involve arbitrary user-uploaded executable code.

Later versions may support a declarative, locally executed feed configuration such as:

```ts
feed({
  sources: [
    following(),
    tag("techno"),
  ],
  exclude: [
    muted(),
    reposts(),
  ],
  sort: newestFirst(),
});
```

or an equivalent JSON/TOML DSL.

Feed rules should execute on the client whenever practical.

---

# 3. Brand and vocabulary

Product name:

**Patches**

CLI command:

```bash
patches
```

Package naming should use the `patches` name where available, or an organization scope if required.

Suggested internal vocabulary:

- **Actor** — a social identity, local or remote.
- **User** — a local authenticated account with credentials.
- **Post** — a root social object or reply.
- **Thread** — a post and its reply tree.
- **Home** — chronological posts from followed actors plus the current actor.
- **Local** — chronological public posts originating on the current Patches instance.
- **Media** — image attachment.
- **Feed** — a client-visible ordered collection.
- **Patch** should *not* be overloaded to mean every database concept merely because of the product name.

Avoid forced cute terminology when conventional technical terms are clearer.

---

# 4. Core product principles

## 4.1 Chronological by default

The home feed MUST be chronological.

Ordering:

```text
created_at DESC
id DESC
```

No engagement ranking.

No hidden relevance score.

No recommendation score.

No “top posts.”

No silent reranking.

---

## 4.2 No infinite engagement machinery

Patches MUST NOT initially implement:

- autoplay,
- video,
- reels,
- stories,
- engagement streaks,
- algorithmic recommendations,
- addictive notification frequency optimization,
- view counts,
- impressions,
- creator monetization scores,
- follower-growth charts,
- trending ragebait,
- targeted advertising.

Pagination is acceptable.

An explicit “load more” interaction is preferable to endless automatic scrolling.

---

## 4.3 Text and images are first-class

v0 content types:

- plain text,
- static photos/images,
- links,
- replies combining text and optionally images.

No video.

No audio in v0.

No animated GIF requirement in v0.

---

## 4.4 Personal identity matters

Profiles should eventually feel more expressive than modern sterile social profiles.

v0 profile:

- avatar,
- display name,
- `@handle`,
- bio,
- optional location text,
- optional personal URL,
- joined date,
- pinned post later.

Future profile concepts may include:

- profile theme,
- profile song,
- guestbook,
- Top 8,
- custom profile links,
- limited safe customization.

Do not implement arbitrary HTML/CSS in the initial product.

---

## 4.5 Small social interactions over metrics

Likes/favorites MAY exist.

If implemented:

- the current user needs to know whether they liked something,
- authors may see aggregate counts,
- aggregate counts need not dominate timeline UI.

Do not create leaderboards.

---

## 4.6 Open architecture

The TUI is one client.

The backend MUST not embed terminal-specific assumptions into its domain layer.

Future clients should include:

- React Native,
- desktop GUI,
- browser client if desired,
- third-party clients.

---

# 5. Explicit non-goals for v0/MVP

Do not implement these before the MVP is stable:

- DMs.
- Group DMs.
- Voice.
- Video.
- Stories.
- Live streaming.
- Ads.
- Payment processing.
- Premium subscriptions.
- Creator monetization.
- Full-text Elasticsearch cluster.
- AI moderation.
- ML ranking.
- Recommendations.
- arbitrary server-side BYO algorithm execution.
- ActivityPub federation.
- AT Protocol federation.
- multi-region active-active databases.
- sharded databases.
- Kubernetes.
- Redis.
- Kafka.
- RabbitMQ.
- event-sourcing the entire application.
- GraphQL.
- microservices by domain.
- a React web social client.
- custom profile HTML.
- executable profile JavaScript.
- plugins downloaded from untrusted users.
- End-to-end encrypted chat.
- quote-post mechanics.
- anonymous posting.

These can be revisited only after a usable product exists.

---

# 6. Definition of v0 vs MVP

These terms have distinct meanings.

## v0

v0 is the **first deployed vertical slice**.

It proves the architecture and core experience.

A user must be able to:

1. install the TUI,
2. register/login,
3. create a profile,
4. find another local user,
5. follow them,
6. create a text post,
7. create an image post,
8. read a chronological home feed,
9. open a thread,
10. reply,
11. like/favorite,
12. block/mute,
13. report,
14. log out,
15. reconnect later with persisted credentials.

v0 may be invite-only.

v0 does not require federation.

---

## MVP

MVP is the **public portfolio-quality alpha**.

It includes everything from v0 plus:

- polished terminal navigation,
- robust image rendering and fallback,
- notifications,
- bookmarks,
- public/local timeline,
- account verification,
- password reset,
- proper moderation/admin tools,
- media processing,
- production telemetry,
- deployment automation,
- integration tests,
- backup/recovery documentation,
- user-facing documentation,
- good README,
- demo media,
- release packaging,
- resilient reconnect/error behavior.

MVP should be credible as a small real service, not merely a demo.

---

# 7. Mandatory technology stack

## Runtime

Use:

```text
Node.js 24 LTS
```

Do not use Node Current as the production baseline.

Node 24 is the current LTS line at the time of this specification. citeturn284328search0

Official reference:

https://nodejs.org/en/about/previous-releases

---

## Language

Use modern:

```text
TypeScript
```

Requirements:

- strict mode enabled,
- no implicit `any`,
- avoid `any`,
- prefer `unknown` when data is untrusted,
- ESM unless a required library makes this impractical,
- enable sensible modern compiler checks.

Recommended:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true
}
```

Adjust generated protobuf code if some flags are incompatible, but do not weaken the entire repository merely for generated files.

---

## Package manager

Use:

```text
pnpm 11
```

pnpm provides native workspace/monorepo support, and pnpm 11 requires modern Node releases. citeturn284328search1turn284328search29

Official reference:

https://pnpm.io/

---

## Tool version manager

Use:

```text
mise
```

Commit:

```text
mise.toml
```

Use it for at minimum:

- Node,
- pnpm,
- Buf,
- optionally flyctl and other deterministic development CLIs.

Example conceptual configuration:

```toml
[tools]
node = "24"
pnpm = "11"
buf = "latest"
```

Pin exact tool versions once the repository is initialized rather than permanently relying on floating `latest`.

Mise supports checked-in project tool configuration and Node/pnpm workflows. citeturn284328search3turn284328search27

Official reference:

https://mise.jdx.dev/

---

# 8. Monorepo

Use:

- pnpm workspaces,
- Turborepo.

Turborepo handles task orchestration and caching; pnpm remains the package manager/workspace implementation. citeturn284328search2turn284328search6

Do not use Nx unless a concrete blocker emerges.

Repository shape:

```text
patches/
├── apps/
│   ├── server/
│   ├── worker/
│   ├── tui/
│   └── admin/
│
├── packages/
│   ├── proto/
│   ├── config/
│   ├── domain/
│   ├── database/
│   ├── observability/
│   ├── media/
│   └── testkit/
│
├── infra/
│   ├── docker/
│   ├── fly/
│   └── compose/
│
├── docs/
│   ├── architecture/
│   ├── decisions/
│   ├── operations/
│   └── product/
│
├── .github/
│   └── workflows/
│
├── mise.toml
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
├── tsconfig.base.json
├── eslint.config.*
├── prettier.config.*
├── docker-compose.yml
└── README.md
```

Do not create a separate npm package merely for one helper function.

Packages should represent legitimate shared boundaries.

---

# 9. Backend framework

Use:

```text
NestJS 11
```

NestJS 11 remains the stable major at the time of this specification. citeturn203547search0

Official documentation:

https://docs.nestjs.com/

Required reading before backend implementation:

- Fundamentals
- Modules
- Providers
- Controllers
- Guards
- Interceptors
- Exception filters
- Configuration
- Authentication
- Authorization
- gRPC microservices
- Standalone applications
- Testing
- Health checks

Do not simply scaffold Nest modules and place all logic in controllers.

Controllers are transport adapters.

Domain/application logic belongs in services/use-cases.

---

# 10. Backend architecture: modular monolith

Patches MUST begin as a modular monolith.

Logical modules:

```text
App
├── AuthModule
├── UsersModule
├── ActorsModule
├── ProfilesModule
├── PostsModule
├── FeedsModule
├── SocialGraphModule
├── MediaModule
├── ReactionsModule
├── NotificationsModule
├── ModerationModule
├── AdminModule
├── JobsModule
└── FederationModule        # interfaces/stubs only initially
```

These are module boundaries, **not microservices**.

They should run in one primary backend deployment.

Why:

- simple transactions,
- simple debugging,
- fewer network boundaries,
- less deployment overhead,
- easier local development,
- easier end-to-end testing.

Future service extraction should happen only if demonstrated load or organizational ownership justifies it.

---

# 11. Worker architecture

A worker process SHOULD exist by MVP.

Implement it using a Nest standalone application context.

Nest officially supports standalone application contexts without network listeners, which are appropriate for background workers and scripts. citeturn901807search0

`apps/worker` should import relevant shared modules/providers from the backend architecture rather than duplicating business logic.

Worker responsibilities initially:

- send verification emails,
- send password-reset emails,
- process uploaded media,
- clean expired uploads,
- clean expired auth tokens,
- execute durable outbox jobs.

Later:

- federation delivery,
- federation retry,
- remote actor refresh,
- remote media proxy/cache,
- notification fan-out if required.

---

# 12. Do not add Redis initially

PostgreSQL is sufficient.

Do not add:

- BullMQ,
- Redis streams,
- Redis pubsub,
- RabbitMQ,
- Kafka.

Use a PostgreSQL-backed durable job/outbox mechanism.

Workers should claim jobs with:

```sql
SELECT ...
FOR UPDATE SKIP LOCKED
```

inside a transaction.

Each job needs fields conceptually equivalent to:

```text
id
type
payload
status
attempts
max_attempts
available_at
locked_at
locked_by
last_error
created_at
completed_at
```

Required behavior:

- durable,
- retryable,
- idempotent,
- exponential backoff,
- poison/dead state after maximum retries,
- concurrent-worker safe.

No busy-loop polling.

Use sensible sleep/backoff when no jobs exist.

---

# 13. Transactional outbox

Operations that must trigger durable asynchronous work should write the application mutation and outbox record in **the same PostgreSQL transaction**.

Example:

```text
transaction
    create user
    create verification token
    create SEND_VERIFICATION_EMAIL outbox item
commit
```

This prevents:

```text
database write succeeds
process crashes
queue publication disappears
```

The outbox architecture is especially important because future ActivityPub federation will depend on durable remote delivery.

Do not build an abstract enterprise event bus.

A well-defined PostgreSQL table and worker is sufficient.

---

# 14. Database

Use:

```text
PostgreSQL
```

Production:

```text
Fly Managed Postgres
```

Fly recommends its managed product rather than its older unmanaged Fly Postgres offering for production deployments. citeturn475506search8

Local:

Docker Compose PostgreSQL.

Use the same major PostgreSQL version locally and in production wherever practical.

---

# 15. ORM

**TypeORM is mandatory.**

Use current stable:

```text
TypeORM 1.x
```

TypeORM 1.0 shipped in 2026 and 1.x is now the current release line. citeturn214577search0

Official docs:

https://typeorm.io/

---

# 16. TypeORM rules

Use the **Data Mapper / repository approach**.

Do not use Active Record entities as application services.

Entities represent persistence.

Business logic belongs in Nest services.

---

## 16.1 Migrations

Production MUST use migrations.

Configuration MUST include:

```text
synchronize: false
migrationsRun: false
```

TypeORM explicitly documents automatic synchronization as unsafe for production schema evolution and provides migrations for this purpose. citeturn214577search1turn214577search5

Never enable:

```text
synchronize: true
```

outside disposable tests unless extremely explicitly scoped.

---

## 16.2 Migration execution

CI must verify migrations.

Deployment should run migrations as an explicit release step before new application instances become live.

Do not rely on every app instance racing to apply migrations at startup.

Generated migrations MUST be reviewed.

Database-specific indexes MAY be written manually.

TypeORM notes that some PostgreSQL-specific index definitions should be created manually in migrations. citeturn214577search4

---

## 16.3 Transactions

When inside a TypeORM transaction:

**always use the transaction-specific `EntityManager`.**

Do not call global repositories from inside a transaction callback.

TypeORM explicitly requires operations inside its transaction callback to use the supplied transactional manager. citeturn214577search8

---

## 16.4 Relations

Avoid eager loading by default.

Avoid broad cascade behavior.

Explicitly query required relations.

Every meaningful cascade must be intentional and documented.

---

# 17. Database naming conventions

Use:

```text
snake_case
```

for:

- tables,
- columns,
- indexes,
- constraints.

Examples:

```text
users
actors
posts
post_media
refresh_tokens
created_at
canonical_uri
```

TypeScript uses camelCase.

Do not allow ORM defaults to create inconsistent naming.

---

# 18. Primary identifiers

Use UUIDs for externally meaningful application entities.

Suggested:

```text
uuid
```

Primary entities include:

- users,
- actors,
- posts,
- media,
- reports,
- notifications.

Internal queue/outbox records MAY use `bigint`.

Do not expose sequential database IDs as public social identifiers.

---

# 19. Federation-aware identity model

The data model MUST distinguish:

```text
User
```

from:

```text
Actor
```

A **User** is a local authenticated account.

An **Actor** is a social identity.

This distinction is mandatory because federation will eventually introduce remote actors who do not have local credentials.

Relationship:

```text
User
  1
  |
  1
Actor
```

A remote Actor later exists without a User.

---

# 20. User entity

Conceptual fields:

```text
users
-----
id uuid primary key

email
email_normalized
email_verified_at

password_hash

status
  ACTIVE
  SUSPENDED
  DELETED

actor_id uuid unique

created_at
updated_at
deleted_at
```

Email uniqueness should be enforced on normalized values.

Never store plaintext passwords.

Never log passwords.

---

# 21. Actor entity

Conceptual fields:

```text
actors
------
id uuid primary key

user_id uuid nullable unique

handle
handle_normalized

display_name
bio
location_text
website_url

avatar_media_id nullable

is_local boolean

home_server nullable

canonical_uri nullable unique
inbox_uri nullable
outbox_uri nullable

federation_state

created_at
updated_at
deleted_at
```

For local actors before federation, `canonical_uri` MAY be null or generated from configured origin.

Before federation becomes public, canonical actor URLs MUST use a stable production domain.

Do not permanently bake temporary `*.fly.dev` addresses into federated identities.

---

# 22. Handle rules

Local handle constraints:

- lowercase canonical representation,
- display may preserve input case only if desired,
- ASCII initially,
- letters,
- digits,
- underscore,
- reasonable length such as 3–30 characters.

Examples:

```text
allison
techno_rat
alice123
```

Do not support Unicode confusable handles in v0.

Represent future federated handles as:

```text
@alice@example.social
```

Local users may render as:

```text
@alice
```

---

# 23. Post entity

Conceptual fields:

```text
posts
-----
id uuid primary key

author_actor_id uuid

body text nullable

post_type
  NOTE
  LINK

link_url nullable

visibility
  PUBLIC
  UNLISTED
  FOLLOWERS

in_reply_to_id uuid nullable
root_post_id uuid nullable

canonical_uri nullable unique
origin_server nullable
is_local boolean

client_request_id uuid nullable

created_at
updated_at
edited_at nullable
deleted_at nullable
```

Constraints:

A post MUST contain at least one of:

- text,
- image attachment,
- link.

Replies are posts.

Do not create a separate comment entity.

---

# 24. Thread representation

Replies form a self-referencing tree.

Store:

```text
in_reply_to_id
root_post_id
```

`root_post_id` avoids recursively walking upward simply to identify the thread.

A root post has:

```text
in_reply_to_id = null
root_post_id = its own id
```

or an equivalent consistently documented representation.

Thread retrieval should support bounded depth and pagination.

Do not load an arbitrarily large thread in one request.

---

# 25. Post deletion

Use soft deletion/tombstoning semantics.

Do not immediately destroy every post row.

Reasons include:

- thread integrity,
- moderation audit,
- future federation delete semantics.

User-visible deleted post:

```text
[deleted]
```

The original body/media must no longer be returned to normal clients.

Actual retention policies should be documented separately.

---

# 26. Post editing

Editing is OPTIONAL in v0 and SHOULD exist by MVP.

If editing exists:

- set `edited_at`,
- preserve the original creation timestamp,
- do not silently treat edits as new posts.

Future federation must map edits to ActivityPub `Update`.

---

# 27. Media entities

Use:

```text
media
-----
id uuid

owner_actor_id

state
  PENDING_UPLOAD
  PROCESSING
  READY
  FAILED
  DELETED

source_object_key
display_object_key
thumbnail_object_key

mime_type
width
height
byte_size

alt_text

content_hash

created_at
processed_at
deleted_at
```

Join attachments using:

```text
post_media
----------
post_id
media_id
position
```

Unique:

```text
(post_id, media_id)
(post_id, position)
```

Maximum v0 attachments:

```text
4 images per post
```

---

# 28. Supported media in v0

Accept static:

- JPEG,
- PNG,
- WebP.

Reject initially:

- SVG,
- PDF,
- TIFF,
- executable formats,
- video,
- arbitrary binary files,
- animated image formats unless safely detected and intentionally supported later.

Suggested limits:

```text
10 MB per uploaded image
20 megapixels maximum decoded dimensions
4 images per post
```

Exact limits MAY be adjusted after performance testing.

They MUST exist.

---

# 29. Object storage

Use:

```text
Cloudflare R2
```

R2 exposes an S3-compatible API, making the storage layer portable through normal S3 tooling. citeturn475506search5turn475506search12

Official reference:

https://developers.cloudflare.com/r2/

Use:

```text
@aws-sdk/client-s3
@aws-sdk/s3-request-presigner
```

against the R2 endpoint.

---

# 30. Direct media upload flow

Do not route the full image upload through the NestJS process.

Flow:

```text
TUI
 |
 | BeginMediaUpload
 v
NestJS
 |
 | create media row
 | generate short-lived presigned PUT
 v
TUI
 |
 | PUT image
 v
Cloudflare R2
 |
 | upload complete
 v
TUI
 |
 | FinalizeMediaUpload
 v
NestJS
 |
 | queue media processing
 v
worker
```

Cloudflare documents presigned PUT URLs for temporary direct client upload. citeturn475506search1turn475506search9

Presigned URLs MUST:

- expire quickly,
- restrict object key,
- restrict expected content type when practical,
- never expose R2 secret credentials.

---

# 31. Media processing

Use:

```text
sharp
```

Worker procedure:

1. fetch uploaded object,
2. inspect file signature and metadata,
3. reject unsupported format,
4. validate size/dimensions,
5. normalize EXIF orientation,
6. decode safely,
7. create display derivative,
8. create thumbnail derivative,
9. omit sensitive metadata,
10. calculate dimensions/hash,
11. upload derivatives,
12. mark media `READY`,
13. delete or quarantine temporary original according to policy.

Sharp supports fast image metadata inspection and common raster formats. citeturn901807search2

Do not trust:

- filename extensions,
- client-provided MIME types,
- client-provided dimensions.

---

# 32. Media privacy

The initial R2 bucket SHOULD be private.

The API may provide short-lived presigned GET URLs after authorization.

This allows future follower-only posts without redesigning object storage.

The TUI should cache downloaded media locally.

Suggested cache directory:

```text
$XDG_CACHE_HOME/patches/media
```

fallback:

```text
~/.cache/patches/media
```

macOS MAY use a platform-conventional cache path if implemented cleanly.

Implement a bounded LRU-style cache.

Do not allow unlimited disk growth.

---

# 33. Authentication

Do not outsource primary authentication to Firebase, Auth0, Clerk, or Supabase Auth in v0.

Authentication belongs in the NestJS application.

Use:

- email,
- handle,
- password,
- email verification,
- access token,
- rotating refresh token.

Registration can initially require an invite.

---

# 34. Password hashing

Use:

```text
Argon2id
```

OWASP currently recommends Argon2id for password storage and provides minimum parameter guidance. citeturn451922search0

Reference:

https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

Use a maintained Node implementation.

Benchmark parameters on deployment hardware.

Do not blindly choose settings that make login either trivially cheap or unusably expensive.

Never encrypt passwords reversibly.

Hash them.

---

# 35. Access tokens

Use short-lived bearer access tokens.

Suggested lifetime:

```text
15 minutes
```

JWT is acceptable.

Access token claims should be minimal:

```text
sub = user id
actor_id
session_id
iat
exp
```

Do not embed private profile data or authorization state that is expected to change frequently.

Use asymmetric signing if convenient for future multi-service verification.

---

# 36. Refresh tokens

Refresh tokens MUST be:

- cryptographically random,
- high entropy,
- opaque,
- stored hashed in the database,
- rotated on refresh.

Database:

```text
refresh_tokens
--------------
id uuid
user_id
session_id
token_hash
expires_at
used_at nullable
revoked_at nullable
created_at
user_agent nullable
```

Implement refresh-token reuse detection.

If an already-rotated token is reused, revoke the relevant session/token family.

---

# 37. TUI credential storage

Use a `CredentialStore` abstraction.

Preferred implementation for macOS/Linux/Windows:

```text
@napi-rs/keyring
```

Do NOT use the original `node-keytar`, whose repository has been archived. citeturn753764search0turn753764search1

Important:

`@napi-rs/keyring` may not function on every headless/Termux environment, so import/use it defensively rather than making the entire CLI crash if the platform has no credential backend. citeturn753764search4

Fallback:

- do not persist credentials by default if secure storage is unavailable,
- optionally allow an explicitly acknowledged local credential file,
- set restrictive filesystem permissions,
- print a clear warning.

Never silently store refresh tokens world-readable.

---

# 38. Registration

Recommended alpha flow:

```text
patches register
```

Prompt:

```text
email:
handle:
display name:
password:
invite code:
```

Then:

```text
We sent a verification code to alice@example.com.
Verification code:
```

Avoid requiring a browser for initial registration.

That preserves the terminal-native product identity.

---

# 39. Email

Production:

```text
Resend
```

Local development:

```text
Mailpit
```

Resend has a current Node SDK and requires a verified sending domain for production use. citeturn229362search0

Mailpit can run in Docker and provides local SMTP plus a browser inbox for development/testing. citeturn229362search1

Implement an abstraction:

```ts
interface EmailProvider {
  sendVerificationCode(...): Promise<void>;
  sendPasswordResetCode(...): Promise<void>;
}
```

Adapters:

```text
ConsoleEmailProvider
MailpitEmailProvider
ResendEmailProvider
```

Do not spread provider-specific calls throughout domain services.

---

# 40. Protobuf

Protocol Buffers are the canonical client application API schema.

Use:

```text
proto3
```

Schemas belong in:

```text
packages/proto/proto/patches/v1/
```

Example:

```text
auth.proto
users.proto
actors.proto
posts.proto
feeds.proto
media.proto
moderation.proto
notifications.proto
common.proto
```

Package namespace:

```proto
package patches.v1;
```

---

# 41. Buf

Use:

```text
Buf CLI
```

Required:

```bash
buf format
buf lint
buf breaking
buf generate
```

Buf provides linting, code generation, and breaking-change detection for Protobuf APIs. citeturn568079search5turn568079search22turn568079search29

Official reference:

https://buf.build/docs/

CI MUST reject protobuf breaking changes against the main branch unless intentionally introducing a new API version.

Never reuse a removed protobuf field number.

Reserve deleted field numbers and names.

---

# 42. Protobuf TypeScript generation

Prefer:

```text
ts-proto
```

if integration remains clean.

`ts-proto` supports NestJS-oriented generation and grpc-js output options. citeturn766161search0

Reference:

https://github.com/stephenh/ts-proto

However:

NestJS officially uses:

```text
@grpc/grpc-js
@grpc/proto-loader
```

for its gRPC transport. citeturn547498view0

Do not fight Nest's runtime model merely to force a generator.

Acceptable architecture:

- `.proto` files are canonical,
- Buf validates them,
- `ts-proto` generates compile-time TypeScript types/interfaces,
- Nest loads the `.proto` definitions through its supported gRPC mechanism.

Do not hand-maintain TypeScript interfaces duplicating every protobuf message.

Generated source MUST be clearly marked generated.

---

# 43. gRPC

Primary TUI/backend transport:

```text
gRPC
```

Use:

```text
@grpc/grpc-js
```

Do not use the deprecated native `grpc` package.

The current grpc-node implementation is pure JavaScript through `@grpc/grpc-js`. citeturn203547search3

Nest gRPC docs:

https://docs.nestjs.com/microservices/grpc

---

# 44. gRPC conventions

Authentication metadata:

```text
authorization: Bearer <access-token>
```

Correlation:

```text
x-request-id
```

Client version:

```text
x-patches-client-version
```

Optional client type:

```text
x-patches-client: tui
```

Every call must have a deadline.

Suggested defaults:

```text
normal unary request: 10 seconds
upload initialization: 10 seconds
authentication: 15 seconds
```

Do not permit RPC calls to wait forever.

---

# 45. gRPC retries

Automatic retries MUST be conservative.

Reads MAY retry transient failures.

Writes MUST NOT blindly retry unless the request is idempotent.

Creation RPCs should carry:

```text
client_request_id
```

The backend should enforce idempotency where retries could duplicate state.

Example:

```text
CreatePostRequest
  client_request_id = UUID
```

Unique constraint concept:

```text
(author_actor_id, client_request_id)
```

---

# 46. Pagination

Never use offset pagination for timelines.

Use cursor/keyset pagination.

Order:

```text
created_at DESC,
id DESC
```

Cursor is server-generated and opaque to clients.

Example conceptual response:

```proto
message PageInfo {
  string next_cursor = 1;
  bool has_more = 2;
}
```

Do not expose raw SQL offsets.

---

# 47. Core gRPC services

Suggested service boundaries:

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

Do not create one giant `PatchesService`.

---

# 48. Auth RPCs

Required:

```text
Register
VerifyEmail
Login
RefreshSession
Logout
LogoutAllSessions
RequestPasswordReset
ResetPassword
GetCurrentSession
```

---

# 49. Actor RPCs

Required:

```text
GetActor
GetActorByHandle
UpdateProfile
SearchActors
ListFollowers
ListFollowing
```

---

# 50. Social graph RPCs

Required:

```text
FollowActor
UnfollowActor
MuteActor
UnmuteActor
BlockActor
UnblockActor
```

Follow state should support future states:

```text
NONE
PENDING
FOLLOWING
```

even if v0 local public accounts immediately follow.

---

# 51. Post RPCs

Required:

```text
CreatePost
GetPost
DeletePost
ListReplies
```

MVP:

```text
EditPost
```

Possible later:

```text
Repost
```

Do not implement quote-posts in the initial MVP.

---

# 52. Feed RPCs

Required:

```text
ListHomeFeed
ListLocalFeed
ListActorPosts
```

MVP MAY add:

```text
ListBookmarks
```

Do not create:

```text
GetRecommendedFeed
GetForYouFeed
```

---

# 53. Reaction RPCs

Required if likes ship:

```text
LikePost
UnlikePost
```

Bookmark:

```text
BookmarkPost
UnbookmarkPost
```

Bookmarks are private.

---

# 54. Media RPCs

Required:

```text
BeginMediaUpload
FinalizeMediaUpload
GetMediaDownload
```

`BeginMediaUpload` returns:

- media ID,
- presigned PUT URL,
- expiration.

`GetMediaDownload` returns:

- authorized short-lived download URL,
- dimensions,
- MIME,
- thumbnail URL if useful.

---

# 55. Moderation RPCs

User-facing:

```text
ReportPost
ReportActor
```

No user-facing API should expose internal moderator notes.

---

# 56. Notification RPCs

MVP:

```text
ListNotifications
MarkNotificationRead
MarkAllNotificationsRead
```

Notification types:

```text
FOLLOW
LIKE
REPLY
MENTION
MODERATION
```

Do not implement push notification infrastructure until mobile exists.

The TUI can poll when active and refresh manually.

---

# 57. Error model

Define application error codes independent of transport.

Examples:

```text
AUTH_INVALID_CREDENTIALS
AUTH_EMAIL_UNVERIFIED
AUTH_SESSION_EXPIRED

ACTOR_NOT_FOUND
HANDLE_TAKEN
ACTOR_BLOCKED

POST_NOT_FOUND
POST_FORBIDDEN
POST_TOO_LONG

MEDIA_TOO_LARGE
MEDIA_UNSUPPORTED_TYPE
MEDIA_NOT_READY

RATE_LIMITED
VALIDATION_ERROR
INTERNAL_ERROR
```

Map them consistently to gRPC status codes.

Do not expose stack traces to clients.

Include request IDs in error metadata/messages where useful.

---

# 58. Input limits

Define explicit limits.

Suggested starting values:

```text
post body: 5,000 Unicode characters
bio: 500
display name: 80
handle: 30
location text: 100
website URL: 2,048
alt text: 1,000
search query: 100
```

These can evolve.

The important requirement is that limits exist in:

- protobuf/API validation,
- service validation,
- database constraints where practical.

---

# 59. Feed query strategy

v0 home feed is fan-out-on-read.

Do not maintain precomputed home timelines.

Conceptually:

```sql
SELECT ...
FROM posts
WHERE author_actor_id IN (
  current_actor,
  followed_actors
)
AND visibility permits current_actor
AND author not muted
AND author not blocked
AND post not deleted
ORDER BY created_at DESC, id DESC
LIMIT ...
```

Use proper indexes.

Do not fetch all follow IDs into application memory if SQL can express the query efficiently.

Use TypeORM QueryBuilder where queries become non-trivial.

---

# 60. Required indexes

At minimum consider indexes equivalent to:

```text
actors(handle_normalized) UNIQUE

posts(author_actor_id, created_at DESC, id DESC)
posts(created_at DESC, id DESC)
posts(root_post_id, created_at, id)
posts(in_reply_to_id, created_at, id)

follows(follower_actor_id, followee_actor_id) UNIQUE
follows(follower_actor_id, created_at)

blocks(blocker_actor_id, blocked_actor_id) UNIQUE
mutes(muter_actor_id, muted_actor_id) UNIQUE

likes(actor_id, post_id) UNIQUE

bookmarks(user_id, post_id) UNIQUE

notifications(user_id, created_at DESC, id DESC)

media(owner_actor_id, created_at)

outbox_events(status, available_at, id)
```

Validate with actual `EXPLAIN ANALYZE` once representative data exists.

---

# 61. Social graph tables

Use explicit join entities rather than opaque ORM many-to-many magic.

Examples:

```text
follows
-------
id
follower_actor_id
followee_actor_id
status
created_at
accepted_at
```

```text
blocks
------
blocker_actor_id
blocked_actor_id
created_at
```

```text
mutes
-----
muter_actor_id
muted_actor_id
created_at
```

This makes future metadata and federation state easier.

---

# 62. Block semantics

Blocking MUST affect both API behavior and feed generation.

If A blocks B:

- B should not follow A.
- existing follow relationship should be removed or ignored.
- A should not see B in normal feeds.
- B should not see A through authenticated normal API surfaces.
- B should not interact with A's posts.
- notifications should respect the block.

Document public-data limitations separately once federation/public web endpoints exist.

---

# 63. Mute semantics

Mute:

- does not notify muted user,
- does not remove follow automatically,
- hides their posts from the muter's home feed,
- should suppress notifications according to product policy.

---

# 64. Reports

Table:

```text
reports
-------
id
reporter_actor_id
subject_type
subject_actor_id nullable
subject_post_id nullable
reason
details
status
moderator_note
created_at
resolved_at
resolved_by_user_id
```

Statuses:

```text
OPEN
REVIEWING
RESOLVED
DISMISSED
```

Do not delete reported content automatically merely because it was reported.

---

# 65. Moderation/admin tooling

Because Patches is initially TUI-first, do not spend MVP time making a React admin dashboard.

Create a secure admin CLI.

Suggested:

```text
patches-admin
```

or repository command:

```bash
pnpm admin
```

Commands:

```text
invite create
invite list

user inspect <handle>
user suspend <handle>
user unsuspend <handle>

report list
report inspect <id>
report resolve <id>
report dismiss <id>

post remove <id>
```

Use Nest standalone application context or `nest-commander` if appropriate.

Admin commands must write audit records.

---

# 66. Audit log

Create:

```text
admin_audit_log
---------------
id
admin_user_id
action
subject_type
subject_id
metadata jsonb
created_at
```

Never log passwords, access tokens, refresh tokens, or reset codes.

---

# 67. TUI technology

Use:

```text
Ink 7.x
React 19.x
TypeScript
```

Ink 7.x is the current major line and uses the React component model for terminal applications. citeturn568079search3turn568079search50

React's current docs are on the React 19.2 line. citeturn203547search2

References:

https://github.com/vadimdemedes/ink

https://react.dev/

Use `@inkjs/ui` selectively where it fits, but do not let generic components dictate the product's visual identity.

---

# 68. TUI architecture

Structure by application feature rather than one giant component.

Example:

```text
apps/tui/src/
├── app/
│   ├── App.tsx
│   ├── router.ts
│   └── providers/
│
├── screens/
│   ├── HomeScreen.tsx
│   ├── LocalScreen.tsx
│   ├── ThreadScreen.tsx
│   ├── ProfileScreen.tsx
│   ├── NotificationsScreen.tsx
│   ├── SearchScreen.tsx
│   ├── ComposeScreen.tsx
│   └── SettingsScreen.tsx
│
├── components/
│   ├── PostCard.tsx
│   ├── Media.tsx
│   ├── ActorHeader.tsx
│   ├── StatusBar.tsx
│   ├── CommandBar.tsx
│   └── Modal.tsx
│
├── hooks/
├── api/
├── auth/
├── media/
├── state/
├── theme/
└── terminal/
```

Do not put network calls directly in render components.

---

# 69. TUI navigation model

Primary navigation should be keyboard-first.

Baseline:

```text
j / ↓       next item
k / ↑       previous item

Enter       open selected post/thread

c           compose
r           reply

l           like/unlike
b           bookmark/unbookmark

f           follow/unfollow selected actor

m           mute
B           block

/           search

g h         home
g l         local
g n         notifications
g p         own profile

R           refresh

?           help
q           back / quit depending context
Esc         cancel modal/action
```

Exact keybindings may evolve.

Keep them discoverable in UI/help.

---

# 70. Full-screen behavior

The TUI should feel like an application, not a command dumping lines into scrollback.

Use the alternate screen where practical.

On clean exit:

- restore terminal state,
- restore cursor,
- restore raw mode,
- clean inline image placements.

Handle:

- Ctrl+C,
- SIGTERM,
- uncaught errors,
- terminal resize.

Never leave the user's terminal corrupted after a normal failure.

---

# 71. Example layout

Desktop terminal:

```text
┌ patches ─────────────────────────────────────────────────────────┐
│ HOME             LOCAL          NOTIFICATIONS           @allison │
├──────────────────────────────────────────────────────────────────┤
│ @alice                                             2 minutes ago │
│                                                                  │
│ Finally finished the ridiculous synth rack.                      │
│                                                                  │
│              ┌────────────────────────────┐                      │
│              │                            │                      │
│              │      terminal image        │                      │
│              │                            │                      │
│              └────────────────────────────┘                      │
│                                                                  │
│ ♥ 12        4 replies                                            │
├──────────────────────────────────────────────────────────────────┤
│ @bob                                              11 minutes ago │
│ bring back personal websites                                     │
│                                                                  │
│    ↳ @charlie: and guestbooks                                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
 j/k navigate   enter thread   c compose   r reply   ? help
```

Responsive behavior is required for narrower terminals.

Do not assume 120 columns.

---

# 72. Terminal size

Set a practical minimum terminal size.

Example:

```text
minimum width: 60 columns
minimum height: 20 rows
```

If smaller, display a friendly message rather than destroying the layout.

---

# 73. Terminal image rendering

This is a key differentiating feature.

v0 MUST support inline images using the **Kitty Graphics Protocol** where available.

Kitty provides a documented terminal graphics protocol for rendering images inside terminal applications. citeturn901807search1turn901807search10

Official reference:

https://sw.kovidgoyal.net/kitty/graphics-protocol/

Do not assume every terminal supports it.

Implement:

```ts
interface TerminalMediaRenderer {
  detect(): Promise<boolean>;
  render(...): Promise<...>;
  clear(...): Promise<void>;
}
```

Concrete:

```text
KittyGraphicsRenderer
FallbackMediaRenderer
```

Later:

```text
SixelRenderer
ITermRenderer
```

---

# 74. Image-rendering technical spike

Before building the entire timeline UI, create a spike that proves:

1. Ink full-screen layout works.
2. Kitty graphics can render an image at a controlled position.
3. image placement survives normal rerenders.
4. image placements can be removed.
5. scrolling/selecting posts does not leave ghost images.
6. terminal resize can recover cleanly.
7. application exit clears image state.

This spike should happen very early.

If raw Kitty protocol integration and Ink conflict, solve the abstraction cleanly.

Do not replace Ink merely because the graphics integration requires low-level escape sequences.

---

# 75. Image fallback

When no graphics protocol is available, show a useful placeholder:

```text
┌ image · 1600×1067 · jpeg ──────────┐
│ press o to open externally          │
└─────────────────────────────────────┘
```

MAY later add Unicode/chafa-style approximations.

Do not require sixel for MVP.

---

# 76. External media opening

Provide a key such as:

```text
o
```

to open selected media through the operating system default handler when inline display is unavailable or when the user wants a full view.

Use platform-safe spawning.

Never interpolate untrusted file paths into a shell string.

Use argument arrays / no-shell process execution.

---

# 77. Compose experience

`c` opens compose mode.

Example:

```text
┌ New Post ─────────────────────────────────────────┐
│ What's happening?                                │
│                                                  │
│ █                                                │
│                                                  │
│                                                  │
├──────────────────────────────────────────────────┤
│ Attach: none                          143/5000    │
│ ^S post       ^A attach       Esc cancel         │
└──────────────────────────────────────────────────┘
```

Support:

- multiline text,
- image path attachment,
- optional link detection,
- alt text prompt.

Do not silently post when a user accidentally hits Enter.

Use an explicit submit key.

---

# 78. Local state

Do not add Redux by default.

Use:

- React state,
- context,
- hooks,

and add a small state library only if complexity demonstrates a real need.

Server state should be separated conceptually from transient UI state.

A lightweight query/cache abstraction MAY be built around gRPC calls.

Do not port React Query merely to say it exists unless it meaningfully helps the TUI.

---

# 79. Optimistic UI

Likes/bookmarks MAY be optimistic.

Post creation should visibly show sending state.

If a mutation fails:

- revert optimistic state,
- display actionable error,
- do not lose compose text.

Network failures should not eat a user's draft.

---

# 80. Draft persistence

MVP SHOULD persist unsent compose drafts locally.

Store only non-sensitive text/media paths.

Allow:

```text
Discard draft?
Resume draft?
```

---

# 81. Network resilience

The TUI must gracefully handle:

- server offline,
- DNS failure,
- TLS failure,
- auth expiration,
- request timeout,
- temporary gRPC unavailable,
- interrupted media upload,
- stale media URL.

Do not crash to a Node stack trace.

Provide useful user messages.

---

# 82. Release packaging

Eventually publish the TUI as an npm executable.

Goal:

```bash
npm install -g patches
patches
```

Also support:

```bash
pnpm dlx patches
```

Optionally later:

- Homebrew,
- standalone binaries using Node packaging tools,
- Scoop,
- winget.

Do not make packaging block initial development.

---

# 83. API version compatibility

The TUI should send:

```text
client version
protocol version
```

Server should reject clients that are impossibly old with a useful message.

Do not break v1 protobuf fields casually.

Buf breaking checks are mandatory in CI.

---

# 84. Deployment architecture

Production v0:

```text
                     Internet
                        |
                        |
                    Fly Proxy
                        |
                     HTTP/2
                        |
                  +-----v------+
                  | patches-api |
                  | NestJS      |
                  | gRPC        |
                  +-----+------+
                        |
             +----------+-----------+
             |                      |
             v                      v
     Fly Managed Postgres      Cloudflare R2
             |
             |
        +----v-------+
        | worker     |
        | NestJS     |
        | standalone |
        +------------+
```

No Kubernetes.

No EC2 VM manually maintained.

No serverless decomposition.

---

# 85. Fly.io

Use Fly.io for the application runtime.

Fly supports container deployments and can expose HTTP/2-only backends such as gRPC with appropriate `h2_backend` configuration. citeturn475506search20turn735730search1turn735730search2

Official documentation:

https://fly.io/docs/

Read before deployment:

- Launch/deployment,
- app configuration,
- Machines,
- services,
- HTTP/2/gRPC,
- secrets,
- health checks,
- Managed Postgres,
- process groups.

---

# 86. Containers

Build a multi-stage Dockerfile.

Properties:

- deterministic,
- non-root runtime user,
- no development dependencies if avoidable,
- no source secrets,
- minimal runtime image,
- graceful SIGTERM handling.

Build once.

Run different process commands for:

```text
server
worker
```

where practical.

---

# 87. Fly process strategy

Using one image, define process groups if appropriate:

```text
web/server
worker
```

If Fly topology makes gRPC and a later HTTP federation listener awkward on the same public ports, deploy separate Fly apps from the same repository/image rather than adding a bespoke reverse proxy hack.

Do not let deployment cleverness contaminate application architecture.

---

# 88. gRPC ingress

Configure Fly according to current gRPC guidance.

The application may speak h2c behind Fly's TLS-terminating edge.

Do not blindly copy old `fly.toml` examples.

Verify current Fly documentation at implementation time.

Production client connections MUST use TLS.

---

# 89. Health

Implement standard gRPC health support if practical.

Also include application-level readiness checks.

Readiness should include at minimum:

- process initialized,
- PostgreSQL reachable.

R2 should not necessarily make the whole API unready unless required for a route.

Fly supports service-level health checks to keep unhealthy Machines out of routing. citeturn735730search4

---

# 90. Production database

Use:

```text
Fly Managed Postgres
```

Do not self-manage PostgreSQL on a Fly Volume for the production MVP unless Managed Postgres is unavailable.

Backups must be enabled/verified.

Document:

- restore procedure,
- migration rollback policy,
- data-loss expectations.

---

# 91. Domain names

Recommended separation:

```text
patches.social
```

or actual chosen domain.

Potential:

```text
patches.social              marketing/docs
api.patches.social          future HTTP API
grpc.patches.social         gRPC
social.patches.social       federation origin if desired
```

Do not create complexity purely for naming.

Most importantly:

before ActivityPub public federation, choose the permanent canonical actor/object origin.

Federated IDs are URLs.

Treat domain stability seriously.

---

# 92. Vercel

Vercel MAY host:

- landing page,
- documentation site,
- marketing material.

Vercel is **not** the primary NestJS social backend.

Do not make the server architecture depend on Vercel Functions.

---

# 93. Supabase

Do not use Supabase as the application backend.

Do not use:

- Supabase database API directly from clients,
- Supabase Auth,
- Supabase Realtime as the social architecture.

If a hosting emergency makes Supabase-hosted PostgreSQL temporarily attractive, it MAY be used strictly as PostgreSQL behind TypeORM.

Preferred production database remains Fly Managed Postgres.

---

# 94. Firebase

Do not use Firebase for this project.

It provides no architectural advantage for Patches' goals and would obscure the NestJS/backend implementation.

---

# 95. AWS/GCP

Do not begin on raw AWS or GCP.

The architecture should remain portable enough that later migration could map roughly onto:

```text
container runtime
managed Postgres
S3-compatible object storage
background workers
```

That is sufficient.

---

# 96. Local development

Docker Compose should provide:

```text
postgres
mailpit
```

Potentially an S3-compatible local object store such as MinIO MAY be used.

However, make it easy to optionally point development directly at an R2 dev bucket.

Recommended:

```bash
mise install
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
```

The README must make first-run setup boring.

---

# 97. Configuration

Use:

```text
@nestjs/config
```

Nest provides this for environment-based configuration. citeturn470864search15

Validate environment variables at startup.

Application MUST refuse to boot when required production configuration is malformed.

Example environment variables:

```text
NODE_ENV

DATABASE_URL

GRPC_HOST
GRPC_PORT

PUBLIC_ORIGIN

JWT_PRIVATE_KEY
JWT_PUBLIC_KEY

R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_ENDPOINT

RESEND_API_KEY
EMAIL_FROM

INVITE_ONLY
```

Never commit production secrets.

---

# 98. Structured logging

Use Nest's structured JSON logger initially.

Nest supports JSON `ConsoleLogger` output directly. citeturn470864search0

Production logs should include:

- timestamp,
- level,
- service,
- request ID,
- RPC method,
- actor/user IDs where appropriate,
- latency,
- outcome.

Never include:

- password,
- access token,
- refresh token,
- verification/reset code,
- raw authorization header.

---

# 99. Observability

Use:

```text
OpenTelemetry
```

for tracing/metrics as the project matures.

OpenTelemetry's Node SDK supports Node instrumentation and its JS tracing/metrics components are stable. citeturn470864search1turn470864search4

Reference:

https://opentelemetry.io/docs/languages/js/

At MVP:

- request/RPC latency,
- error rate,
- DB query latency where practical,
- worker queue depth,
- failed jobs,
- media processing latency.

Do not build a gigantic observability stack locally.

Export to a simple compatible provider when deploying.

---

# 100. Sentry

Sentry MAY be used for production exception monitoring.

It has direct NestJS integration. citeturn470864search2

Do not make Sentry required for local development.

Sanitize user data.

---

# 101. Security

Security is part of MVP, not a later polish task.

Must include:

- password hashing,
- token rotation,
- rate limiting,
- validation,
- object authorization,
- file validation,
- safe process spawning,
- DB parameterization,
- secrets management,
- sanitized errors,
- audit logging,
- SSRF protections before federation.

---

# 102. Rate limiting

Use Nest rate limiting mechanisms or a clean implementation.

Nest's `@nestjs/throttler` exists specifically for rate limiting and brute-force protection. citeturn717631search5

Without Redis, rate limits may initially be:

- database-backed for sensitive flows,
- process-local for coarse general throttles.

Sensitive actions requiring globally consistent controls:

- login,
- password reset,
- registration,
- verification resend.

Design abstractions so a shared rate-limit store can later be introduced if multiple instances make local limits inadequate.

---

# 103. Validation

Validate all external input.

gRPC/Protobuf typing does not eliminate semantic validation.

Examples:

- valid handle,
- valid email,
- URL protocol allowlist,
- post length,
- attachment count,
- UUID existence,
- enum state,
- image size.

Never trust a TypeScript type as runtime validation.

---

# 104. URL validation

User-provided profile and post URLs:

Allow:

```text
https
http
```

Potentially allow other schemes only deliberately.

Reject dangerous application schemes such as:

```text
javascript:
data:
file:
```

Do not automatically fetch arbitrary user URLs in v0.

This also avoids early SSRF complexity.

---

# 105. Federation architectural seam

Create a module/interface boundary from the beginning:

```ts
interface FederationGateway {
  publishActor(...): Promise<void>;
  publishPost(...): Promise<void>;
  publishDelete(...): Promise<void>;
}
```

v0 implementation:

```text
NoopFederationGateway
```

Do not implement real network federation yet.

The point is to avoid domain services depending directly on ActivityPub structures.

---

# 106. Federation target

First federation target:

```text
ActivityPub
```

Not AT Protocol.

ActivityPub is a W3C Recommendation built on ActivityStreams 2.0. citeturn569623search0turn569623search1

References:

https://www.w3.org/TR/activitypub/

https://www.w3.org/TR/activitystreams-core/

Later also read:

https://www.w3.org/TR/activitystreams-vocabulary/

---

# 107. WebFinger

Fediverse actor discovery later requires WebFinger-style discovery.

Use RFC 7033.

Reference:

https://datatracker.ietf.org/doc/html/rfc7033

The W3C Social Web community specifically documents WebFinger in ActivityPub discovery contexts. citeturn475506search22turn475506search13

---

# 108. Federation stages

## Stage F0 — schemas only

Centralized system.

Data model understands:

- local/remote actor possibility,
- canonical URIs,
- origin,
- tombstones,
- visibility.

No remote requests.

---

## Stage F1 — two-instance lab

Run two Patches servers locally.

Implement:

- WebFinger,
- actor document,
- inbox/outbox,
- Follow,
- Accept,
- Create Note,
- Delete,
- basic Like if desired.

No Mastodon compatibility goal yet.

Prove Patches-to-Patches.

---

## Stage F2 — interoperability

Test against mainstream ActivityPub implementations.

Implement:

- discovery,
- HTTP signing compatible with ecosystem expectations,
- remote actor caching,
- remote object ingestion,
- retry,
- deduplication,
- blocklist,
- domain moderation.

---

## Stage F3 — public federation

Only enable after:

- abuse controls,
- SSRF protection,
- signature verification,
- job retries,
- tombstones,
- remote deletion handling,
- monitoring,
- domain controls.

---

# 109. Federation security

Federation means ingesting hostile Internet input.

Before federation:

- validate remote URLs,
- reject private/reserved IP ranges,
- defend against DNS rebinding,
- limit redirects,
- limit response size,
- enforce timeouts,
- validate content types,
- cap JSON depth/size,
- deduplicate activities,
- verify signatures,
- rate limit remote inboxes,
- maintain domain blocks.

Do not trust a remote actor because it speaks ActivityPub.

---

# 110. Federation persistence

Future remote entities should fit existing tables.

Remote actor:

```text
actors.is_local = false
user_id = null
canonical_uri = remote actor URI
home_server = remote hostname
```

Remote post:

```text
posts.is_local = false
canonical_uri = remote object URI
origin_server = remote hostname
```

May later store original ActivityStreams payload in a bounded JSONB representation for interoperability/debugging.

Do not make raw ActivityStreams JSON the application's primary domain model.

---

# 111. BYO algorithm roadmap

The server MUST NOT expose an engagement-ranked default.

Version progression:

### A0

Only:

```text
chronological
```

### A1

Built-in client feed filters:

```text
following
local
photos only
text only
unread-ish
specific actors
```

### A2

Declarative local feed definitions.

Example:

```toml
name = "friends + techno"
sort = "newest"

[[sources]]
type = "following"

[[sources]]
type = "tag"
value = "techno"

[[exclude]]
type = "muted"
```

### A3

Shareable feed definitions:

```bash
patches feed install alice/friends-and-raves
```

Feed definition packages must initially be **data**, not arbitrary executable code.

---

# 112. Search

v0 user search:

- handle prefix,
- display-name matching.

Post search MAY be deferred.

Do not deploy Elasticsearch.

PostgreSQL full-text/trigram features are sufficient when post search arrives.

---

# 113. Notifications

Store notifications as rows.

No separate event service.

Conceptual:

```text
notifications
-------------
id
user_id
type
actor_id nullable
post_id nullable
read_at nullable
created_at
```

Deduplicate where appropriate.

Examples:

A user should not receive 74 identical notifications because a worker retried.

---

# 114. Product privacy

Write a basic privacy document before public MVP.

Clearly state:

- what account information is stored,
- what posts are public,
- what logs exist,
- what media metadata is stripped,
- what information federation will expose once enabled.

ActivityStreams itself warns that social activity data can contain sensitive personal information and implementations should communicate what is collected/shared. citeturn569623search1

---

# 115. Terms/community guidelines

"no toxicity" cannot be guaranteed purely by architecture.

Instead provide enforceable community rules.

MVP needs concise guidelines covering:

- harassment,
- hate,
- threats,
- doxxing,
- impersonation,
- spam,
- illegal content,
- non-consensual intimate media,
- abuse of technical infrastructure.

Invite-only registration during alpha is strongly preferred.

---

# 116. Testing strategy

Use multiple layers.

## Unit

Test:

- domain rules,
- authorization,
- cursor parsing,
- token rotation,
- feed filtering,
- moderation decisions,
- job retry logic.

---

## Repository/integration

Run real PostgreSQL.

Test:

- constraints,
- transactions,
- joins,
- pagination,
- migrations,
- concurrent worker claiming.

Do not mock TypeORM for every persistence test.

---

## gRPC integration

Start real Nest server.

Invoke it through actual generated gRPC client.

Test:

```text
register
verify
login
post
follow
feed
reply
like
block
```

---

## TUI component tests

Use an Ink-compatible testing approach.

Test:

- rendering,
- navigation,
- key handling,
- state transitions,
- fallback media presentation.

Do not snapshot every terminal pixel.

Prefer meaningful behavior assertions.

---

## End-to-end

MVP needs an automated happy path:

```text
create Alice
create Bob
Alice follows Bob
Bob posts
Alice feed contains post
Alice replies
Bob sees notification
Alice blocks Bob
interaction becomes prohibited
```

---

# 117. Test framework

Prefer a single modern JS/TS test runner where practical.

Vitest is acceptable.

Jest is also acceptable if it reduces Nest integration friction.

Do not spend a week changing test frameworks.

Once chosen, standardize it repository-wide unless a client-specific tool requires otherwise.

---

# 118. Fixtures

Use factories.

Examples:

```text
createTestUser()
createTestActor()
createTestPost()
createTestFollow()
```

Do not create giant inscrutable fixture JSON files.

---

# 119. Database test isolation

Tests must not depend on execution order.

Use:

- per-test transactions where practical,
- schema reset strategies,
- isolated databases for suites if needed.

Never point tests at development or production DB.

---

# 120. CI

Use GitHub Actions.

GitHub provides standard Node CI workflows and setup-node support for deterministic runtime setup/caching. citeturn451922search1

Required PR checks:

```text
format
lint
typecheck
buf format check
buf lint
buf breaking
build
unit tests
integration tests
migration validation
```

---

# 121. Dependency security

Enable:

- Dependabot or Renovate,
- lockfile,
- automated security update PRs.

GitHub Dependabot supports npm ecosystem dependency monitoring. citeturn451922search4

Do not auto-merge arbitrary major dependency updates.

---

# 122. Deployment CI/CD

Main branch deployment only after CI passes.

Suggested flow:

```text
pull request
    |
    v
CI
    |
merge main
    |
    v
build image
    |
    v
run DB migration release step
    |
    v
deploy Fly server
    |
    v
deploy/update worker
    |
    v
smoke tests
```

Do not expose deploy credentials to pull requests from forks.

---

# 123. Migration safety

For non-trivial schema changes use expand/contract.

Example:

Bad:

```text
deploy code expecting renamed column
rename column immediately
```

Better:

```text
add new column
deploy compatible code
backfill
switch reads
remove old column in later release
```

This matters once there is actual production data.

---

# 124. Graceful shutdown

On SIGTERM/SIGINT:

Server:

- stop accepting work,
- drain active RPCs within bounded timeout,
- close DB connections.

Worker:

- stop claiming new jobs,
- finish/return leased jobs safely,
- close application context.

Fly exposes configurable shutdown behavior; still design the application to tolerate earlier termination. citeturn735730search1

---

# 125. Performance expectations

Do not promise arbitrary massive scale.

Design for:

```text
hundreds to low thousands of active users
```

without redesign.

Architecture should naturally scale to multiple stateless API Machines sharing PostgreSQL.

Important targets:

- feed request should not generate N+1 queries,
- media bypasses API data plane,
- cursor pagination,
- database indexes,
- bounded payloads,
- no unbounded thread load,
- worker jobs claim concurrently.

---

# 126. Performance measurement

Before optimizing:

- generate realistic fixture data,
- benchmark feed query,
- inspect `EXPLAIN ANALYZE`,
- measure gRPC latency,
- measure media processing memory.

Do not add Redis because a hypothetical future query might become slow.

---

# 127. Coding conventions

Prefer small cohesive modules.

Avoid:

```text
utils.ts
helpers.ts
common.ts
misc.ts
```

becoming dumping grounds.

Use descriptive domain names.

Avoid "manager" unless something genuinely manages lifecycle/state.

---

# 128. DTO/domain/persistence separation

Do not pass TypeORM entities directly through protobuf responses.

Layers:

```text
protobuf request
        |
        v
transport adapter/controller
        |
        v
application/domain service
        |
        v
repository/TypeORM
```

Likewise response:

```text
entity/query result
        |
        v
domain/application result
        |
        v
protobuf mapper
```

This prevents the database schema from becoming the public API.

---

# 129. Dependency direction

Domain/application modules should not know about Ink.

Database packages should not know about gRPC.

TUI should not import TypeORM entities.

Protobuf package should not import server implementation modules.

Keep dependency direction boring and obvious.

---

# 130. Documentation in repository

Required:

```text
README.md
CONTRIBUTING.md
SECURITY.md
CODE_OF_CONDUCT.md
LICENSE
```

Architecture docs:

```text
docs/architecture/overview.md
docs/architecture/data-model.md
docs/architecture/api.md
docs/architecture/media.md
docs/architecture/jobs.md
docs/architecture/federation.md
```

Operations:

```text
docs/operations/deployment.md
docs/operations/database.md
docs/operations/backups.md
docs/operations/incidents.md
```

Product:

```text
docs/product/principles.md
docs/product/roadmap.md
docs/product/moderation.md
```

---

# 131. Architecture Decision Records

Use ADRs for consequential decisions.

Example:

```text
docs/decisions/
0001-modular-monolith.md
0002-grpc-protobuf.md
0003-typeorm-postgres.md
0004-postgres-outbox.md
0005-r2-media-storage.md
0006-activitypub-later.md
0007-ink-terminal-client.md
```

Keep ADRs short.

Include:

- context,
- decision,
- consequences.

---

# 132. Official documentation policy for Claude/agents

Before changing a technology-specific implementation, consult current primary documentation.

Priority order:

1. official specification,
2. official project docs,
3. official source repository,
4. maintained project examples,
5. secondary articles only if absolutely necessary.

Never treat random Stack Overflow snippets as architectural authority.

---

# 133. Required authoritative references

## Node

https://nodejs.org/en/about/previous-releases

## pnpm

https://pnpm.io/

https://pnpm.io/workspaces

## mise

https://mise.jdx.dev/

## Turborepo

https://turborepo.com/docs

## NestJS

https://docs.nestjs.com/

Especially:

https://docs.nestjs.com/microservices/grpc

https://docs.nestjs.com/standalone-applications

https://docs.nestjs.com/security/authentication

https://docs.nestjs.com/security/authorization

https://docs.nestjs.com/security/rate-limiting

https://docs.nestjs.com/techniques/configuration

https://docs.nestjs.com/techniques/logger

## TypeORM

https://typeorm.io/

Especially:

https://typeorm.io/docs/migrations/why/

https://typeorm.io/docs/migrations/setup/

https://typeorm.io/docs/transactions/

https://typeorm.io/docs/indexes/

## React

https://react.dev/

## Ink

https://github.com/vadimdemedes/ink

## Kitty graphics

https://sw.kovidgoyal.net/kitty/graphics-protocol/

## Protobuf / Buf

https://buf.build/docs/

## gRPC Node

https://github.com/grpc/grpc-node

## Cloudflare R2

https://developers.cloudflare.com/r2/

Especially:

https://developers.cloudflare.com/r2/api/s3/

https://developers.cloudflare.com/r2/api/s3/presigned-urls/

## Fly.io

https://fly.io/docs/

Especially:

https://fly.io/docs/reference/configuration/

https://fly.io/docs/networking/services/

https://fly.io/docs/reference/health-checks/

## ActivityPub

https://www.w3.org/TR/activitypub/

## ActivityStreams

https://www.w3.org/TR/activitystreams-core/

## WebFinger

https://datatracker.ietf.org/doc/html/rfc7033

## OWASP password storage

https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

## OpenTelemetry

https://opentelemetry.io/docs/languages/js/

---

# 134. v0 execution roadmap

Do not build all features simultaneously.

## Phase 0 — repository and risk spikes

Deliver:

- monorepo,
- mise,
- Node/pnpm pinning,
- TypeScript base config,
- Turborepo,
- lint/format,
- GitHub Actions skeleton,
- Docker Compose PostgreSQL,
- Nest hello-world gRPC,
- Ink hello-world client,
- protobuf generation,
- gRPC client call,
- Kitty image proof-of-concept.

Success:

```text
patches TUI calls local Nest server through generated protobuf contract
```

and:

```text
an image can be displayed and cleared in Kitty
```

Do not continue until these architectural risks work.

---

# 135. Phase 1 — persistence and auth

Implement:

- TypeORM configuration,
- initial migrations,
- User,
- Actor,
- refresh token,
- invite,
- email verification,
- AuthService,
- registration/login,
- secure credential storage.

TUI:

```text
patches register
patches login
patches logout
```

Success:

A fresh user can register, verify, log in, restart terminal, and remain authenticated.

---

# 136. Phase 2 — posting

Implement:

- posts,
- create post,
- get post,
- delete post,
- actor profile,
- actor post list.

TUI:

- own profile,
- compose,
- profile timeline.

Success:

Two users can independently post and inspect profiles.

---

# 137. Phase 3 — social graph/feed

Implement:

- follow,
- unfollow,
- home feed,
- local feed,
- keyset pagination.

TUI:

- Home,
- Local,
- actor search,
- follow controls.

Success:

Alice follows Bob.

Bob posts.

Alice's chronological feed shows Bob's post.

---

# 138. Phase 4 — replies/reactions

Implement:

- threaded replies,
- likes,
- bookmarks,
- notifications.

TUI:

- thread screen,
- reply action,
- like,
- bookmark,
- notification screen.

Success:

Core social loop exists.

---

# 139. Phase 5 — production media

Replace image POC with proper pipeline.

Implement:

- R2,
- upload initialization,
- direct upload,
- worker processing,
- Sharp derivatives,
- terminal media cache,
- Kitty rendering,
- fallback.

Success:

Alice attaches photo.

Bob sees it inline in supported terminal.

---

# 140. Phase 6 — moderation/security

Implement:

- block,
- mute,
- report,
- admin commands,
- audit log,
- rate limits,
- account suspension,
- password reset,
- robust validation.

Success:

Service can safely support invited outside users.

---

# 141. Phase 7 — deploy public v0

Deploy:

- Fly server,
- Fly Managed Postgres,
- worker,
- R2,
- Resend,
- production domain,
- secrets,
- health checks.

Add:

- structured logs,
- backup docs,
- smoke tests.

Success:

A user on another computer can:

```bash
npm install -g patches
patches
```

and use the real network.

---

# 142. MVP polish phase

Before calling the project MVP:

- navigation feels intentional,
- resize works,
- errors are human-readable,
- images don't ghost,
- network loss doesn't crash,
- drafts are not easily lost,
- README is excellent,
- install instructions work,
- demo recording exists,
- architecture diagram exists,
- tests run in CI,
- migrations are reproducible,
- moderator workflows work,
- deployment is documented,
- backups are known,
- public alpha has community rules.

---

# 143. Post-MVP roadmap

## 0.3 — feed customization

Implement:

- photo-only feed,
- custom actor lists,
- client filters,
- declarative local feed definitions.

---

## 0.4 — identity personality

Experiment with:

- pinned post,
- profile theme,
- Top 8,
- guestbook,
- richer profile links.

Keep customization safe.

---

## 0.5 — federation lab

Two Patches instances.

ActivityPub fundamentals.

No default public federation yet.

---

## 0.6 — Fediverse compatibility

Mastodon-compatible discovery and basic interactions.

Add domain moderation.

---

## 1.0 — federated Patches

Public federation becomes supported.

Central product still works without federation.

---

# 144. React Native roadmap

Only begin after server contract is stable enough to support a second client.

Add:

```text
apps/mobile/
```

Use:

```text
React Native
TypeScript
```

Reuse:

- domain vocabulary,
- protobuf schemas,
- API semantics,
- authentication concepts.

Do not attempt to reuse Ink UI components directly.

Share non-UI logic only where it genuinely fits.

---

# 145. Mobile transport

Native gRPC MAY be used if React Native support is clean at implementation time.

Otherwise expose a protobuf-derived HTTP transport such as Connect/HTTP.

The canonical schema remains protobuf.

Do not create a completely unrelated hand-written REST model solely for mobile.

---

# 146. Desktop client future

Potential future:

- React Native macOS,
- Electron,
- Tauri,
- native platform app.

Not MVP.

The TUI remains a permanent first-class client, not something discarded once GUI exists.

---

# 147. Future community feature

If Reddit-style communities become desirable, add them **after** the people/following social model works.

Possible future entity:

```text
Community
```

or:

```text
Board
```

Do not call the entity `Patch` merely because the product is named Patches unless the terminology genuinely feels right.

Community future functionality:

- membership,
- moderators,
- chronological posts,
- rules,
- subscriptions.

Avoid Reddit karma replication.

---

# 148. Future tags

Hashtags/tags may be added after MVP.

Do not make tag extraction a critical v0 system.

When added:

- normalize tags,
- store relations,
- index them,
- expose chronological tag feeds.

---

# 149. No hidden recommendation service

There must never be a function casually named:

```text
rankHomeFeed()
```

in v0.

A future discovery feature must be explicitly separate from chronological home.

Users should always have a trivially accessible pure chronological view.

---

# 150. Definition of technical success

Patches is technically successful if the repository demonstrates:

- mature TypeScript,
- NestJS architecture,
- TypeORM,
- PostgreSQL relational design,
- migrations,
- gRPC,
- Protocol Buffers,
- API compatibility,
- authentication,
- authorization,
- background processing,
- durable jobs,
- direct object storage,
- media processing,
- terminal UI,
- React component architecture,
- testability,
- observability,
- production deployment,
- moderation,
- security,
- clear distributed-systems evolution.

It should demonstrate these through necessary product functionality rather than résumé buzzwords.

---

# 151. Definition of product success

A first-time user should be able to understand Patches within minutes:

```text
follow people
post things
see what your people posted
reply to them
```

The terminal should feel playful and personal.

The system should feel refreshingly finite.

The absence of a manipulative ranking algorithm should feel intentional rather than unfinished.

---

# 152. Portfolio narrative

The finished project should make it possible to truthfully describe work along the lines of:

> Designed and shipped a production social platform end-to-end using TypeScript, NestJS, TypeORM, PostgreSQL, Protocol Buffers, and gRPC; built an interactive React/Ink terminal client with inline multimedia support; implemented secure authentication, social graph and chronological feed systems, durable background processing, object-storage media pipelines, moderation tooling, observability, and automated cloud deployment.

Later:

> Extended the platform into a distributed social system using ActivityPub, implementing remote identity discovery, durable federated delivery, idempotency, retry/backoff, eventual consistency, and cross-instance moderation.

Later:

> Built a React Native mobile client against the same versioned application protocol.

Those claims must be earned by the implementation.

Do not fake distributed-systems complexity to manufacture them.

---

# 153. Hard architectural prohibitions

Unless this specification is explicitly revised, the implementation agent MUST NOT:

- introduce Prisma,
- introduce Drizzle,
- introduce GraphQL,
- use Firebase,
- make Supabase the backend,
- introduce Redis in v0,
- introduce Kafka,
- introduce Kubernetes,
- create a service per Nest module,
- use offset timeline pagination,
- store image binaries in PostgreSQL,
- proxy normal image uploads through Node,
- enable TypeORM schema synchronize in production,
- return TypeORM entities directly over API,
- store plaintext refresh tokens,
- store plaintext passwords,
- use engagement ranking,
- enable open federation before moderation/security exists,
- allow arbitrary remote JavaScript feed plugins,
- require a browser for normal TUI usage,
- build the mobile app before the TUI/server MVP,
- abandon terminal fallback behavior when Kitty is unavailable.

---

# 154. Agent behavior during implementation

At the beginning of each phase:

1. inspect existing code,
2. inspect relevant official documentation,
3. identify the smallest complete vertical slice,
4. implement it,
5. run formatting,
6. run linting,
7. run typecheck,
8. run tests,
9. run the application,
10. fix failures before moving on,
11. update relevant documentation.

Do not leave knowingly broken tests for a later phase.

Do not hide errors with:

```text
@ts-ignore
eslint-disable
any
catch {}
```

unless a narrowly documented compatibility reason exists.

---

# 155. When blocked

If a selected dependency has a real incompatibility:

1. verify against current upstream docs/issues,
2. isolate the problem,
3. preserve architectural intent,
4. prefer the smallest substitute or adapter,
5. document the decision in an ADR.

Example:

If a specific protobuf generator cannot cleanly support the current Nest version, switching the **code-generation implementation** is acceptable.

Switching from protobuf/gRPC to tRPC is not.

---

# 156. Initial deliverable required from the implementation agent

Before writing large amounts of implementation code, create:

```text
docs/product/principles.md
docs/architecture/overview.md
docs/architecture/data-model.md
docs/product/roadmap.md
```

Then scaffold the monorepo and prove the Phase 0 vertical slice.

The initial README should contain:

```text
# Patches

Terminal-native social media.

## Development

mise install
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
```

plus whatever exact commands the final repository actually uses.

Never document commands that do not work.

---

# 157. Phase 0 acceptance checklist

Phase 0 is complete only when:

- [ ] `mise install` produces the required toolchain.
- [ ] `pnpm install` succeeds.
- [ ] PostgreSQL starts locally.
- [ ] protobuf schemas compile.
- [ ] Buf lint succeeds.
- [ ] Nest server starts.
- [ ] Ink TUI starts.
- [ ] TUI performs a real gRPC request.
- [ ] request failures render cleanly.
- [ ] Kitty capability can be detected.
- [ ] a test image renders in Kitty.
- [ ] the image can be cleared.
- [ ] terminal state restores after exit.
- [ ] CI executes build/typecheck/test skeleton.

---

# 158. v0 acceptance checklist

v0 is complete only when two real users can:

- [ ] register,
- [ ] verify email,
- [ ] login,
- [ ] persist session securely,
- [ ] edit profile,
- [ ] search local actors,
- [ ] follow,
- [ ] unfollow,
- [ ] post text,
- [ ] upload static image,
- [ ] view inline image in Kitty,
- [ ] use media fallback elsewhere,
- [ ] see chronological home feed,
- [ ] see chronological local feed,
- [ ] open thread,
- [ ] reply,
- [ ] like,
- [ ] unlike,
- [ ] bookmark,
- [ ] block,
- [ ] mute,
- [ ] report,
- [ ] receive basic notifications,
- [ ] logout.

And administrators can:

- [ ] create invites,
- [ ] inspect reports,
- [ ] suspend user,
- [ ] remove content,
- [ ] inspect audit record.

---

# 159. MVP deployment checklist

MVP is complete only when:

- [ ] production domain configured,
- [ ] TLS works,
- [ ] gRPC through Fly works,
- [ ] Managed Postgres configured,
- [ ] R2 configured,
- [ ] worker configured,
- [ ] email delivery configured,
- [ ] migrations deploy automatically but explicitly,
- [ ] secrets are not in repository,
- [ ] production health checks work,
- [ ] structured logs work,
- [ ] error monitoring works or documented alternative exists,
- [ ] backup strategy exists,
- [ ] restoration procedure is documented,
- [ ] rate limiting exists,
- [ ] integration suite passes,
- [ ] smoke tests pass after deploy,
- [ ] README installation works from clean environment,
- [ ] npm package install works,
- [ ] TUI works against production,
- [ ] user documentation exists,
- [ ] moderation guidelines exist.

---

# 160. Federation readiness checklist

Do not publicly enable federation until:

- [ ] stable canonical domain selected,
- [ ] WebFinger works,
- [ ] actors serialize correctly,
- [ ] ActivityStreams objects validate,
- [ ] inbox works,
- [ ] outbox works,
- [ ] Follow works,
- [ ] Accept works,
- [ ] Create works,
- [ ] Delete works,
- [ ] Update semantics decided,
- [ ] deliveries are durable,
- [ ] duplicate delivery is safe,
- [ ] retries are bounded,
- [ ] signatures verified,
- [ ] SSRF defenses exist,
- [ ] remote response sizes bounded,
- [ ] remote request timeouts exist,
- [ ] domain blocking exists,
- [ ] remote delete/tombstones work,
- [ ] moderator can block remote server,
- [ ] federation telemetry exists,
- [ ] two Patches servers interoperate,
- [ ] at least one mainstream Fediverse implementation interoperates.

---

# 161. Final architectural summary

The intended mature architecture is:

```text
                            PATCHES
                               |
               +---------------+---------------+
               |                               |
               v                               v
       +---------------+              +----------------+
       |  Ink / React  |              |  React Native  |
       |     TUI       |              |     later      |
       +-------+-------+              +--------+-------+
               |                               |
               |        protobuf contracts     |
               +---------------+---------------+
                               |
                         gRPC / HTTP
                               |
                     +---------v---------+
                     |      NestJS       |
                     | modular monolith  |
                     +---------+---------+
                               |
            +------------------+--------------------+
            |                  |                    |
            v                  v                    v
      +-----------+      +-----------+       +-------------+
      | Postgres  |      |    R2     |       | Nest worker |
      | TypeORM   |      |   media   |       | outbox/jobs |
      +-----------+      +-----------+       +------+------+
                                                     |
                                                     |
                                            future federation
                                                     |
                                                     v
                                             +---------------+
                                             |  ActivityPub  |
                                             |   Fediverse   |
                                             +---------------+
```

The most important architecture rule is:

> **Start centralized, model federation correctly, earn distributed complexity later.**

The most important product rule is:

> **Chronological first. The server gives the user their social world; the client decides how to arrange it.**

The most important implementation rule is:

> **Ship usable vertical slices. Do not bury Patches underneath infrastructure created for hypothetical scale.**

Build the weird little terminal social network first.

Then make it excellent.

Then make it federate.

Then give it more clients.

---

# 162. Amendment A — 2026-08-17: nodes, credentials, Pages, nameplates

This part is an **amendment**, not a rewrite. Sections §0–§161 remain as written; where this
amendment and an earlier section disagree, **this amendment wins**, and the earlier section
is annotated below as amended or superseded.

Do not edit §0–§161 in place to match this part — the history is the point. Do not
re-litigate a decision recorded here; if it must change, write a further amendment and an ADR.

Scope of Amendment A:

| Section       | Effect                                                                    |
| ------------- | ------------------------------------------------------------------------- |
| §163          | Node model. Amends §1, §3, §84, §91.                                      |
| §164          | Identity portability seam. Amends §21, §110.                              |
| §165          | Credentials separate from identity. **Supersedes §20 `password_hash`.** Amends §33, §38, §39. |
| §166          | SSH-key authentication. Amends §33, §37, §48.                             |
| §167          | GitHub credential via device flow. Amends §33, §48.                       |
| §168          | Auth/node RPC additions. Amends §47, §48.                                 |
| §169          | Per-node sessions in the TUI. Amends §37, §78, §82.                       |
| §170–§172     | Patches Pages. Adds after §4.4; amends §4.4, §143 (0.4).                   |
| §173          | Nameplates. Amends §4.4.                                                  |
| §174          | Capabilities, not tiers. New.                                             |
| §175          | Five product pillars and vocabulary. Amends §3, §4.                       |
| §176          | Release sequence v0.0–v1.0. Amends §108, §134, §143.                       |
| §177          | Additional hard prohibitions. Amends §153 (adds; removes nothing).         |

Everything not listed above is unchanged. In particular, Amendment A does **not** relax any
prohibition in §153, does not change the chronological-feed rule (§4.1), and does not move
public federation earlier than its security gates (§109, §160).

---

# 163. Node model

**Amends §1, §3, §84, §91.**

Patches is **social-server software**. A deployment of that software is a **node**.

`patches.social` is the flagship hosted node — the **reference node**. It is the first node,
the deployment this repository ships, and the conformance reference for client behavior. It
is **not** "the backend", and no document, identifier, or code comment may describe it as
such.

Rules:

- Identity is `@handle@domain`. A handle is only unique **within a node**.
- Each node is authoritative for its own local actors and for nothing else.
- There MUST NOT be a global user database, a central account service, a central directory,
  or any registry that a node requires in order to function.
- A node MUST be fully operable standalone, with no other node reachable.
- A node's identity is its canonical domain (§91). One node has exactly one canonical
  domain, fixed before federation is enabled.
- Nodes MUST expose their own policy to clients rather than hardcoding it client-side; see
  `GetNodeInfo` (§168) and capabilities (§174).

Self-hosting is a product goal, not a side effect. A node release MUST be runnable by a
competent operator with `docker run`/Compose plus documented environment variables, and MUST
NOT require a proprietary dependency: object storage is any S3-compatible endpoint (R2 is the
reference choice, §29), email is any SMTP endpoint or provider adapter (§39).

Federation MUST default to **disabled** on a fresh node, and MUST NOT be enabled on any node
until the §109 controls exist in that build. Shipping self-hostable software does not lower
the federation security bar; it raises it, because the operator inherits it.

---

# 164. Identity portability seam

**Amends §21, §110.**

Account portability between nodes is a stated goal (§176, v0.4). The **seam** is built now;
the feature is not.

`actors` gains:

```text
moved_to_uri     text nullable   -- this actor has moved to another actor URI
also_known_as    text[] / jsonb  -- prior/alternate actor URIs this actor claims
```

Rules:

- Both columns exist from the Phase 1 schema and are unused until v0.4. They are federation
  bookkeeping, never product surface.
- A local actor with `moved_to_uri` set MUST be treated as read-only: no new posts, no new
  follows accepted.
- Migration MUST be bidirectionally verified — the destination actor must claim the origin
  actor in `also_known_as` before a move is honored. A one-sided claim MUST NOT be trusted.

Protocol accuracy (verified 2026-08-17): `Move` **is** a standard ActivityStreams 2.0
activity type (https://www.w3.org/TR/activitystreams-vocabulary/); `movedTo` and
`alsoKnownAs` are **not** — they are Mastodon-originated properties documented
non-normatively by the W3C SocialCG (https://swicg.github.io/miscellany/), with FEP-7628 in
progress. Name our columns in our own terms, map to the community property names only at the
federation boundary, and never describe them in code or docs as standard ActivityStreams.

**Export** is independent of federation and is not gated behind any capability, tier, or
payment: an actor MUST be able to export profile, posts, media manifest, page document
(§170), and social graph as a documented archive.

---

# 165. Credentials are separate from identity

**Supersedes §20's `password_hash` field. Amends §33, §38, §39.**

A credential is a way to prove you are a user. It is not who you are. Changing, adding, or
revoking a credential MUST NOT change the actor, the handle, or any social relationship.

`users` (superseding §20):

```text
users
-----
id uuid primary key
actor_id uuid unique

recovery_email             nullable
recovery_email_normalized  nullable
email_verified_at          nullable

status  ACTIVE | SUSPENDED | DELETED

created_at
updated_at
deleted_at
```

`password_hash` is removed from `users`. Email is now **recovery/verification only** — it is
not the account identifier, and it is not the login key.

`credentials` (new):

```text
credentials
-----------
id uuid primary key
user_id uuid

type  PASSWORD | SSH_PUBLIC_KEY | GITHUB        -- PASSKEY reserved, not v0

identifier       text nullable   -- lookup key, scoped to type
secret_hash      text nullable   -- Argon2id hash; PASSWORD only
public_material  text nullable   -- OpenSSH public key blob; SSH_PUBLIC_KEY only
metadata         jsonb nullable  -- non-secret provider bookkeeping

label            text nullable   -- human label, user-supplied ("work laptop")
created_at
last_used_at     nullable
revoked_at       nullable
```

`identifier` semantics per type:

- `SSH_PUBLIC_KEY` — the key fingerprint in OpenSSH `SHA256:<base64>` form.
- `GITHUB` — the GitHub **numeric account id** (§167). Never the login name.
- `PASSWORD` — NULL. Password login resolves the user by handle or verified recovery email
  first, then loads that user's password credential. Copying a normalized email into
  `credentials.identifier` would create a second source of truth for the same value and a
  guaranteed drift bug the first time a recovery address changes.

Rules:

- A user MAY hold several credentials, including several of the same type (several SSH keys
  is the normal case).
- At most one active `PASSWORD` credential per user:
  `UNIQUE (user_id) WHERE type = 'PASSWORD' AND revoked_at IS NULL`.
- `UNIQUE (type, identifier) WHERE revoked_at IS NULL AND identifier IS NOT NULL` — one SSH
  key or GitHub account cannot authenticate two users on the same node.
- Revoking the last active credential MUST fail. An account MUST always retain a way in.
- Adding a credential to an existing account MUST require an authenticated session.
- `secret_hash` MUST NOT be logged, MUST NOT be returned over gRPC, and MUST NOT appear in
  any DTO. `ListCredentials` returns type, label, identifier, `created_at`, `last_used_at`
  only.
- Password hashing remains Argon2id per §34, unchanged.

Email policy (SHOULD-level, node-configurable):

- An account whose only credential is `PASSWORD` MUST have a verified recovery email —
  otherwise password reset has no channel and the account is unrecoverable.
- An account with a non-password credential MAY omit email entirely.
- A node MAY require email by policy; the invite-only alpha on the reference node does.
- Registration SHOULD prompt any account holding exactly one credential and no verified
  email to add a second credential or a recovery address.

---

# 166. SSH-key authentication

**Amends §33, §37, §48.** This is the terminal-native login path, and the one that best fits
the product: the key is already there, the agent is already running, no browser exists.

Verified references (2026-08-17): RFC 9987, *Secure Shell (SSH) Agent Protocol* (Standards
Track, May 2026) — https://www.rfc-editor.org/rfc/rfc9987.html — whose §5.6
`SSH_AGENTC_SIGN_REQUEST` has the agent sign **client-supplied arbitrary data** with a loaded
identity; and RFC 4252 §7 *publickey* authentication —
https://www.rfc-editor.org/rfc/rfc4252.html — whose signed blob prepends the session
identifier to the request fields. Patches imitates that binding discipline; it does not
implement SSH. Mechanics are in `docs/architecture/auth.md`.

`BeginSshLogin` issues a challenge; the client has the agent sign it; `CompleteSshLogin`
verifies and returns the standard session envelope (§35, §36). The signed blob MUST bind, in
a documented fixed order:

```text
"patches-ssh-login-v1"     -- domain separation string; version it, never reuse it
node canonical domain      -- prevents replaying a signature against another node
challenge id
nonce                      -- >= 32 bytes from a CSPRNG
credential fingerprint
expires_at
```

Requirements:

- Challenges are single-use, TTL ≤ 120 seconds, consumed atomically, and rate-limited per IP
  and per claimed handle (§102).
- Signature verification MUST be over the exact reconstructed blob. The server MUST NOT sign
  or accept any blob whose contents were chosen by the client.
- **No enumeration.** SSH public keys are public — GitHub publishes them. A failed
  `CompleteSshLogin` MUST be indistinguishable whether the key is unknown, revoked, or the
  signature was wrong: one generic `UNAUTHENTICATED`. `BeginSshLogin` MUST return a
  challenge regardless of whether any supplied fingerprint is enrolled. Only when the client
  supplies a claimed handle MAY the server narrow the accepted-fingerprint set, and that
  path MUST be rate-limited.
- Accepted algorithms: `ssh-ed25519` SHOULD be preferred and offered first. `rsa-sha2-256` /
  `rsa-sha2-512` MAY be accepted. SHA-1 `ssh-rsa` signatures MUST be rejected.
- Enrollment: the TUI MAY enumerate agent identities and `~/.ssh/*.pub` and offer them
  ("found 3 SSH identities — use `id_ed25519` as your Patches identity key?"). Enrollment
  MUST be explicit user confirmation, never automatic.
- Patches MUST NOT read, request, transmit, or store an SSH **private** key, ever, under any
  flag. Signing happens in the agent. If no agent is available, the client MAY read a public
  key for enrollment only, and MUST fall back to another credential type for login.

---

# 167. GitHub credential via OAuth device flow

**Amends §33, §48.**

GitHub is a **credential**, never an identity. A GitHub account does not become an actor, and
GitHub profile data MUST NOT populate handle, display name, avatar, or bio without an
explicit, separate user action. Patches issues its own sessions (§35, §36) in every case; no
part of primary authentication is outsourced, so §33's intent is preserved.

Device flow is used because it is the only OAuth flow that needs no browser *on this
machine*: the user is shown a code, enters it on any device, and the CLI polls. Endpoints,
parameters, polling rules and error codes are recorded in `docs/architecture/auth.md`,
verified against
https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
(2026-08-17). Device flow MUST be explicitly enabled in the OAuth app's settings, and the
stable account id comes from `GET https://api.github.com/user` → `id`.

Requirements:

- The credential identifier is the numeric `id`. The login name MUST NOT be used as the
  identifier — it is mutable and reusable, which makes it an account-takeover vector.
- The GitHub access token is used once, to read the account id, and then discarded. Patches
  MUST NOT persist third-party access or refresh tokens in v0. Requested scope MUST be the
  minimum that returns the account id.
- Linking GitHub to an existing account MUST require an authenticated Patches session.
- GitHub login is **additive and optional**. §153's "never require a browser for normal TUI
  usage" is unaffected: Patches MUST always offer at least one fully browserless
  authentication path, and the reference node MUST always offer both password and SSH.

---

# 168. Auth and node RPC additions

**Amends §47, §48.** Added to the §48 list:

```text
BeginSshLogin
CompleteSshLogin
BeginGitHubLogin
PollGitHubLogin
ListCredentials
AddCredential
RevokeCredential
```

Plus a new service (§47):

```text
service NodeService
  GetNodeInfo
```

Notes:

- `Login` (§48) is the **password** login. The name is kept for continuity; it MUST NOT
  become a polymorphic grab-bag of credential types.
- Every login RPC returns the same session envelope, so the client's session handling is
  identical regardless of credential type.
- `Register` accepts an optional initial credential, so SSH-first registration never has to
  pass through a password.
- `GetNodeInfo` is unauthenticated and returns node domain, software version, registration
  mode, input limits (§58), and capabilities (§174). Clients MUST discover node policy here
  rather than assuming the reference node's policy.
- `VerifyEmail`, `RequestPasswordReset`, `ResetPassword` remain, and apply only to accounts
  with a verified recovery email (§165).

---

# 169. Per-node sessions in the TUI

**Amends §37, §78, §82.** The client talks to nodes, plural.

```bash
patches login <node>        # e.g. patches login patches.social
patches accounts            # list stored accounts, mark the active one
patches use @alice@node     # switch active account
patches logout [node]
```

Requirements:

- `CredentialStore` (§37) is keyed by **node origin + user id**. Sessions from different
  nodes MUST NOT be interchangeable, and a token MUST NOT be sent to any origin other than
  the one that issued it.
- The default node is the reference node, overridable by config and environment.
- The config file lists known nodes and the active account. It MUST NOT contain tokens;
  tokens live in the keyring, with §37's guarded file fallback and its warning behavior
  unchanged.
- The TUI MUST refuse to silently downgrade transport security: connecting to a node over
  plaintext, or with an untrusted certificate, MUST require an explicit, visible opt-in.

---

# 170. Patches Pages

**Adds after §4.4; amends §4.4 and §143's 0.4 milestone.** This is a product pillar (§175),
not a profile decoration.

Every actor has a **Page**: a personal site, expressed as a **portable declarative
document**, stored on the actor's node and rendered by **clients**.

- The document is **data**, never code (§172).
- The server stores, validates, versions, and serves the document. The server MUST NOT
  render it — there is no server-side HTML, no server-side template, no server-side theme
  engine.
- The TUI renders it with Ink. A web renderer (React DOM) comes later. Both consume the same
  document; neither is privileged.
- Addressing: `patches visit @allison[@node][/slug]` in the TUI; `allison.patches.page` on
  the web later.
- Federation: the page manifest is advertised as a Patches extension property on the actor
  document. A plain Fediverse server that does not understand it gets an ordinary actor and
  loses nothing.

This supersedes the framing in §4.4 where profile theme/Top 8/guestbook were "future
concepts": they are Page blocks, and Pages v1 is scheduled (§176).

---

# 171. Page document schema

Versioned, validated, bounded:

```text
PatchesPage {
  version: int                       -- schema version, required
  theme: {
    accent, background, foreground   -- named or hex; renderers degrade
    border: single | double | round | ascii | none
    avatarStyle
  }
  pages: [
    {
      slug, title,
      blocks: [ Text | Markdown | Image | Links | Posts | Gallery
              | Friends | TopEight | Guestbook | NowPlaying
              | Badges | AsciiArt | Spacer | Hero ]
    }
  ]
}
```

Rules:

- Blocks are a **flat list**. Blocks MUST NOT nest recursively in v1 — recursion is a
  renderer-complexity and denial-of-service surface with no v1 payoff.
- Limits (enforced server-side, published via `GetNodeInfo`): document ≤ 64 KiB serialized,
  ≤ 32 sub-pages, ≤ 128 blocks per sub-page, ≤ 8 KiB text per block, guestbook entry
  ≤ 500 characters. Per-block detail lives in `docs/architecture/pages.md`.
- Storage (§176 Phase 4.5): `pages`, `page_revisions` (immutable snapshots — a bad edit is
  recoverable and moderation has an audit trail), `page_assets` (counted against the node's
  storage capability), `guestbook_entries`.
- **Strict on write, lenient on render.** The server MUST validate a submitted document
  strictly against its declared `version` and reject unknown block types and unknown fields.
  A renderer MUST ignore block types it does not support, rendering a visible placeholder
  rather than failing the page. This is what makes the format portable across clients that
  ship on different schedules.

---

# 172. Page rendering and security

**No user-authored executable code, in any client, ever, in the portable format.** No React,
no MDX, no JS, no template language, no expression evaluator. A Page is inert data. This is
the same rule as §111's "feed definitions are data, not code" and §153's prohibition on
remote JavaScript plugins, applied to the personal-web pillar.

Further requirements:

- Images in a Page MUST be Patches media (§27–§32). Arbitrary remote image URLs MUST NOT be
  fetched or embedded: that is an SSRF vector, a tracking vector, and an IP-address leak for
  every visitor.
- Link URLs are validated per §104 (`http`/`https` only; `javascript:`, `data:`, `file:`
  rejected).
- Markdown blocks are rendered by the client from a **safe subset**. Raw HTML passthrough
  MUST be disabled.
- Guestbook entries are plain text, subject to blocks/mutes (a blocked actor MUST NOT be
  able to sign), rate-limited (§102), reportable (§64), and removable by the page owner and
  by moderators. Guestbooks are spam magnets; treat entry creation as hostile input.
- Nameplates and page themes MUST NOT be able to break the TUI's layout or overwrite the
  screen outside the block being rendered. Renderers MUST strip control characters and
  escape sequences from all user-supplied strings.

**Advanced web mode (later, web-only).** A future capability MAY allow user-authored
HTML/CSS/assets. If built, it MUST be served from an isolated origin (`*.patches.page` or a
dedicated usercontent domain), never same-origin with the application, with a strict
`Content-Security-Policy` including `script-src 'none'`, and it MUST NOT have access to any
Patches session, token, or cookie. The TUI is unaffected — it renders the portable document
only.

---

# 173. Nameplates

**Amends §4.4.** A **nameplate** is how an actor appears *everywhere their name appears* —
timeline, thread, mention, follower list — as distinct from a Page, which you visit.

Fields (bounded, stored as a validated `nameplate` document on the actor, ≤ 2 KiB): name
color or gradient, glyph, badges, avatar frame, status line, profile border.

Requirements:

- Rendering MUST degrade by terminal capability: truecolor → 256 → 16 → none. A nameplate
  MUST never be required to read a post.
- Readability wins. Renderers MUST enforce legibility (contrast floor, no zero-width or
  bidirectional trickery, no control characters, bounded width) and MUST provide a plain
  mode that strips all decoration.
- **Badges are server-attested only** (e.g. node admin, moderator, supporter, verified
  domain). A user MUST NOT be able to set badge text. Free-text badges are handle spoofing
  with extra steps.
- A nameplate MUST NOT be able to impersonate another actor's handle or a system message.
- Write-time validation is against the capabilities granted to that user by that node
  (§174). On import from another node, unsupported decoration is preserved but not rendered,
  so migration never silently destroys someone's identity.

---

# 174. Capabilities, not tiers

The protocol expresses **capabilities**, decided per node by policy:

```text
capabilities {
  animatedNameplate
  customDomain
  maxSiteStorageBytes
  customFonts
  ...
}
```

Rules:

- There MUST NOT be a `tier`, `plan`, `subscription`, `premium`, or `is_supporter` field in
  the protocol, and no client may branch on one. Clients branch on capabilities only.
- A node decides how capabilities are granted. A self-hoster MAY grant everything to
  everyone; that MUST remain a supported configuration, not a degraded one.
- The reference node MAY fund storage, custom domains, and expensive extravagance through a
  supporter tier. That is a **node billing concern**, invisible to the protocol.
- Basic personal expression — having a Page, having a nameplate, having a handle, exporting
  your data — MUST NOT be paywalled on any node claiming to run Patches.
- Capabilities MUST NOT be used to gate safety, moderation, or portability features.

There is no premium caste in the protocol. Money may buy storage and bandwidth; it does not
buy social standing.

---

# 175. Product pillars and vocabulary

**Amends §3 and §4.** The product rests on five pillars:

1. **Social without engagement optimization.** Chronological, no ranking, no metrics
   theater (§4.1, §4.2 unchanged).
2. **Terminal-native multimedia social computing.** The terminal is the primary surface, not
   a novelty port.
3. **Personal web revival.** Every actor has a Page (§170).
4. **Local ownership, federated network.** Every deployment is a node; `patches.social` is
   the reference node, not the center (§163).
5. **Clients are powerful.** Portable data — feeds, pages, nameplates — rendered by Ink, the
   web, mobile, or third-party clients. The server does not decide presentation.

Vocabulary added to §3:

- **Node** — a Patches deployment, authoritative for its local actors. Prefer "node" over
  "instance" or "server" in product language.
- **Page** — an actor's portable declarative personal site (§170).
- **Nameplate** — an actor's inline identity presentation (§173).
- **Credential** — a way to prove you are a user; not an identity (§165).

**Local** (§3) now means: public posts originating on *this node*.

Wording correction: Ink does **not** render HTML — it renders a React component tree to a
terminal via Yoga flexbox layout. Any doc, comment, or ADR implying otherwise is wrong and
must be fixed. This is exactly why Pages are a shared declarative model rather than markup:
the Ink renderer and a future DOM renderer consume the same data, and neither is a
translation of the other.

---

# 176. Release sequence

**Amends §108, §134, §143.** Federation moves earlier than §143 scheduled it, but the rule
in §0 stands unchanged: **finish the centralized vertical slice first.**

| Release | Contents                                                                       | Federation stage |
| ------- | ------------------------------------------------------------------------------ | ---------------- |
| v0.0    | Single-node social loop. Phases 0–7 as specified (§134–§141), plus Phase 4.5.   | F0               |
| v0.1    | Two-node Patches-to-Patches federation lab (Phase 8).                          | F1               |
| v0.2    | Self-hostable node release (Phase 9).                                          | F1               |
| v0.3    | Mastodon/Pixelfed interoperability (Phase 10).                                 | F2               |
| v0.4    | Identity portability and migration between nodes (Phase 11).                   | F2               |
| v1.0    | Public federation (Phase 12).                                                  | F3               |

**Phase 4.5 — Pages v1** sits between the core social loop and production media: page
document schema, storage and revisions, `PageService`, the Ink renderer, basic theme, and
the blocks `Text`, `Markdown`, `Links`, `Posts`, `TopEight`, `Guestbook`. `Image` and
`Gallery` are defined in the schema at 4.5 but MUST render as placeholders until the Phase 5
media pipeline (§139) exists — the schema is allowed to lead the pipeline; the renderer is
not allowed to fake it.

Constraints that do not move:

- Phase 8's lab is **local and non-public**. It is §108's Stage F1, unchanged.
- Every §109 control is a hard gate before any node exposes federation to the Internet, and
  the §160 checklist still gates v1.0 in full.
- v0.2 ships with federation disabled by default (§163).
- Credentials, SSH login, and per-node sessions land in **Phase 1**; the GitHub device flow
  lands in **Phase 6**, because it is the first outbound HTTP call to a third party (and so
  wants Phase 6's URL/timeout/SSRF validation baseline), it is an account-linking
  takeover surface best built alongside suspension and audit logging, and nothing in the v0
  acceptance checklist (§158) depends on it.

---

# 177. Additional hard prohibitions

**Amends §153 by addition. Nothing in §153 is relaxed.** The implementation agent MUST NOT:

- describe or design `patches.social` as "the backend" rather than a node,
- introduce a global user database, central account service, or cross-node registry that
  nodes depend on,
- allow user-authored executable code in the Page format, in any client,
- serve user-authored HTML/CSS same-origin with the application, or with scripting enabled,
- embed arbitrary remote URLs as page/profile media,
- store a plaintext credential secret of any type, or return `secret_hash` over gRPC,
- persist third-party OAuth access or refresh tokens in v0,
- read, transmit, or store an SSH private key,
- use a mutable provider login name as a credential identifier,
- confirm whether an SSH public key or email is enrolled before authentication succeeds,
- allow a user to set their own badge text,
- introduce a `tier`/`plan`/`premium` field into the protocol, or paywall a Page, a
  nameplate, or data export,
- make email mandatory for accounts holding a non-password credential, unless the node has
  explicitly configured that policy,
- enable federation by default in a self-hosted node build.
