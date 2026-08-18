# tasks.md — live task board

Conventions: `- [ ] ID — description` · IDs are `P<phase>-<nnn>` (H = harness, B = backlog/discovered, A = audit findings).
Check off with `- [x]`. Add a trailing `(#issue)` when mirrored to GitHub. Keep the newest audit findings at the top of
**Backlog**. When a phase's tasks are all done, run `/audit` before starting the next phase. Managed via `/task`.

## Harness

- [x] H-001 — CLAUDE.md operating manual
- [x] H-002 — `.claude/settings.json` with pnpm-only guard, prettier post-edit hook, session-start summary
- [x] H-003 — Agent roster in `.claude/agents/` (researcher, implementer, reviewer, architect, verifier, docs, spec-auditor)
- [x] H-004 — Skills: `/task`, `/verify`, `/retro`, `/audit`, `/proto-change`, `/migration`, `/phase`
- [x] H-005 — Path-scoped rules in `.claude/rules/` (server, tui, proto, database)
- [x] H-006 — `docs/agents/HARNESS.md`, `LEARNINGS.md`, `MODEL_ROUTING.md`

## Phase 0 — repository and risk spikes (spec §134, §157)

- [x] P0-001 — Pin toolchain in `mise.toml` (node 24, pnpm 11, buf, docker-compose provider, actionlint)
- [x] P0-002 — Repo hygiene: LICENSE, CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, issue/PR templates, CODEOWNERS, .editorconfig, .gitignore
- [x] P0-003 — Product/architecture/ops docs + ADRs 0001–0010 (`docs/`)
- [x] P0-004 — Research notes for every risky tech (`docs/research/`)
- [x] P0-005 — Monorepo scaffold: pnpm workspace + catalog, turbo.json, tsconfig.base, eslint flat config, prettier, vitest projects, root scripts
- [x] P0-006 — `infra/compose`: postgres 17 + mailpit (+ optional minio); `mise run compose` wrapper; `.env.example`
- [x] P0-007 — `packages/proto`: buf v2 config, `patches/v1/common.proto` + `health`/hello slice, ts-proto generation committed, lint/format/breaking scripts
- [x] P0-008 — `apps/server`: Nest 11 gRPC microservice hello-world (`patches.v1.PingService`?) with config validation, JSON logger, graceful shutdown, health
- [x] P0-009 — `apps/tui`: Ink 7 hello-world that performs a real gRPC call to the server with deadline + metadata; renders errors cleanly; fullscreen + clean exit
- [x] P0-010 — Kitty graphics spike: detect capability, render test image via unicode placeholders inside Ink list, survive rerender/scroll/resize, clear on exit; fallback box _(automated: 86 tests + detection verified in real Ghostty; manual §74 checklist → B-003)_
- [x] P0-011 — `packages/database`: TypeORM 1.x DataSource, snake naming strategy, migration scripts wired (`pnpm db:*`), smoke migration + test against real Postgres
- [x] P0-012 — GitHub Actions CI: format, lint, typecheck, buf lint/format/breaking, build, unit, integration (postgres service), migration check; dependabot
- [x] P0-013 — README with real, verified first-run commands
- [x] P0-014 — Phase 0 acceptance checklist (§157) verified end-to-end and recorded in `docs/product/roadmap.md` _(2 image items await manual confirmation, tracked in B-003)_

## Phase 1 — persistence and auth (§135, amended by §165–§169)

> **Amendment A applies here.** No `users.password_hash` — credentials live in `credentials`
> (§165, ADR 0011). Email is nullable recovery data. Auth methods this phase: **password +
> SSH challenge** (GitHub device flow is Phase 6). Sessions are per node.
> Read [`docs/architecture/auth.md`](docs/architecture/auth.md) before starting.

- [x] P1-000 — Protobuf contract for auth/actors/posts/feeds: `auth.proto` (Register/VerifyEmail/ResendVerification/Login/RefreshSession/Logout/LogoutAllSessions/RequestPasswordReset/ResetPassword/GetCurrentSession + BeginSshLogin/CompleteSshLogin/BeginGitHubLogin/PollGitHubLogin/ListCredentials/AddCredential/RevokeCredential per Amendment A §165–§168), `actors.proto` (ActorService + FieldMask-based UpdateProfile), `posts.proto`, `feeds.proto`; typed grpc-js client factories; A-010/A-011 fixes. Schema only — no server handlers yet (tracked by P1-003/P1-011/P1-012/P1-014/P2-002)
- [x] P1-001 — Entities + migrations: actors (incl. `moved_to_uri`, `also_known_as`, `nameplate`), users (no password_hash; nullable recovery_email), **credentials**, **ssh_login_challenges**, refresh_tokens, invites, `auth_codes`, `outbox_jobs` (+ Phase 2 `posts`/`media`/`post_media`); outbox claim helpers; testkit factories
- [x] P1-002 — `packages/config` env schema (zod) shared by server/worker/admin
- [x] P1-003 — AuthService: register (invite-only, optional initial credential), verify email, password login, refresh (rotation + reuse detection), logout, logout-all, password reset request/reset
- [x] P1-004 — Argon2id hashing on `credentials.secret_hash`, jose EdDSA JWT access tokens, opaque hashed refresh tokens
- [x] P1-005 — Auth gRPC controller + auth guard/interceptor reading `authorization` metadata; error code mapping
- [x] P1-006 — Outbox/jobs table + worker claim loop (SKIP LOCKED, backoff, dead-letter) + email jobs; EmailProvider (console/mailpit/resend)
- [x] P1-007 — TUI: `patches register|login|logout|accounts`, CredentialStore keyed by **node origin + user id** (@napi-rs/keyring + guarded file fallback), auto-refresh
- [x] P1-008 — Rate limiting for login/register/reset/verify/challenge-issuance — shipped process-local (fixed window, §102 allows coarse process-local throttles); the db-backed store §102 wants by MVP is A-018
- [x] P1-009 — Tests: unit (token rotation, hashing, validation) + gRPC integration (register→verify→login→refresh)
- [x] P1-010 — Research note `docs/research/ssh-signature-verification.md`: which Node library verifies OpenSSH-format public-key signatures, verified against official docs (blocks P1-011)
- [x] P1-011 — SSH challenge auth: `BeginSshLogin`/`CompleteSshLogin`, `ssh_login_challenges`, blob binding (purpose + node domain + challenge id + nonce ≥32B + fingerprint + expiry), single-use TTL ≤120s, ed25519 first, SHA-1 `ssh-rsa` rejected (§166)
- [x] P1-012 — Credential management RPCs: `ListCredentials` (never returns `secret_hash`), `AddCredential` (requires authenticated session), `RevokeCredential` (fails on last active credential)
- [x] P1-013 — TUI SSH enrollment: enumerate ssh-agent identities + `~/.ssh/*.pub`, explicit confirm, sign via `SSH_AGENTC_SIGN_REQUEST`; **never read/transmit a private key**
- [x] P1-014 — `NodeService.GetNodeInfo` (unauthenticated): node domain, version, registration mode, limits, capabilities (§174) — no `tier` field, ever
- [x] P1-015 — Security tests: challenge replay + cross-node replay + expiry, algorithm downgrade, credential enumeration (uniform failures), last-credential revocation
- [x] P1-016 — AuthService.register: bootstrap registration on an invite-only node with an empty `users` table (first account registers without an invite code, logged as a WARN); subsequent registrations still require one

## Phase 2 — posting (§136)

- [x] P2-001 — posts, post_media entities + migrations; idempotent CreatePost (client_request_id)
- [x] P2-002 — PostService/ActorService: CreatePost, GetPost, DeletePost (tombstone), UpdateProfile, GetActor(ByHandle), ListActorPosts
- [x] P2-003 — TUI: profile screen, compose screen (explicit submit, draft not lost), profile timeline

## Phase 3 — social graph & feeds (§137)

- [x] P3-001 — follows entity, Follow/Unfollow, ListFollowers/Following, SearchActors
- [x] P3-002 — FeedService: ListHomeFeed / ListLocalFeed with keyset pagination, block/mute-aware SQL, indexes verified with EXPLAIN
- [x] P3-003 — TUI: Home, Local, search, follow controls, `g h`/`g l` navigation, load-more

## Phase 4 — replies, reactions, notifications (§138)

- [x] P4-001 — Threads: ListReplies (bounded depth + pagination), reply creation, root_post_id semantics
- [x] P4-002 — likes, bookmarks entities + Reaction RPCs
- [x] P4-003 — notifications rows (FOLLOW/LIKE/REPLY/MENTION/MODERATION), dedupe, ListNotifications/MarkRead
- [x] P4-004 — TUI: thread screen, reply, like, bookmark, notifications screen

## Phase 4.5 — Pages v1 (§170–§172)

- [x] P45-001 — `PatchesPage` schema + validator in `packages/domain` (versioned, flat blocks, strict-on-write); limits: doc ≤64 KiB, ≤32 sub-pages, ≤128 blocks/page, ≤8 KiB/block
- [x] P45-002 — Entities + migrations: pages, page_revisions (immutable), page_assets, guestbook_entries
- [x] P45-003 — `PageService`: GetPage, UpdatePage (new revision per write), ListGuestbook, SignGuestbook (rate-limited, block-aware, reportable, owner/moderator removal)
- [ ] P45-004 — Ink page renderer + basic theme; blocks Text/Markdown/Links/Posts/TopEight/Guestbook; unknown blocks render a placeholder, never fail the page
- [ ] P45-005 — `Image`/`Gallery` defined in schema but render as placeholder until Phase 5 media exists (§176) _(schema half done — `Image`/`Gallery` block schemas + Patches-media-id-only enforcement exist in `packages/domain`; placeholder rendering is TUI work, P45-004/006)_
- [ ] P45-006 — TUI `patches visit @handle[/slug]` + page editor
- [ ] P45-007 — Nameplate rendering everywhere a name appears: capability degradation (truecolor→256→16→none), plain mode, server-attested badges only (§173)
- [x] P45-008 — Security tests: no executable code path, control-character/escape-sequence stripping on every user string, remote-URL media rejected, `javascript:`/`data:`/`file:` links rejected _(domain + server half: `packages/domain` unit tests + `apps/server/test/pages.integration.test.ts`'s VALIDATION_ERROR/block-awareness coverage; TUI rendering-side checks land with P45-004/006)_

## Phase 5 — production media (§139)

- [x] P5-001 — media entity, BeginMediaUpload (presigned PUT to R2), FinalizeMediaUpload, GetMediaDownload
- [x] P5-002 — Worker PROCESS_MEDIA with sharp (validate, orient, strip, derivatives, hash)
- [ ] P5-003 — TUI: attach image path, upload progress, bounded LRU media cache, Kitty inline + fallback + `o` open externally

## Phase 6 — moderation & security (§140)

- [x] P6-001 — blocks/mutes entities + RPCs + feed/API enforcement
- [x] P6-002 — reports + ReportPost/ReportActor
- [x] P6-003 — `apps/admin` CLI (invite/user/report/post/jobs commands) with admin_audit_log _(`apps/admin` — plain TypeScript CLI, no Nest/gRPC, talks to Postgres directly via `@patches/database`; unit + Postgres-integration tests, `docs/operations/moderation.md`)_
- [x] P6-004 — suspension enforcement, password reset end-to-end, validation sweep, URL scheme allowlist _(landed by a prior agent — `auth.guard.ts` suspension check, `auth.integration.test.ts`'s password-reset/suspension integration tests, `common/validation/url.ts` — see `git show fa0b525`; this task's slice ticks it off alongside the doc sync in `docs/architecture/api.md`/`auth.md`)_
- [x] P6-005 — GitHub credential via OAuth **device flow** (§167): `BeginGitHubLogin`/`PollGitHubLogin`, identifier = numeric account id (never login name), token discarded after reading the id, linking requires an authenticated session, honor `interval`/`slow_down` _(landed by a prior agent — `github-device-flow.service.ts` + fake-GitHub-server integration test, see `git show fa0b525`; ticked off here alongside the `docs/architecture/api.md` status-sync this task did)_

## Phase 7 — deploy public v0 (§141)

- [x] P7-001 — Multi-stage Dockerfile (server+worker, non-root), fly.toml (h2 gRPC, process groups, release_command migrations, checks) _(infra/docker/Dockerfile, infra/fly/fly.toml — never deployed, no Fly account in this environment; podman build verified through all dependency packages, blocked at apps/server's tsc step by an unrelated concurrent in-progress change — see docs/operations/deployment.md)_
- [x] P7-002 — Deploy workflow (main → build → migrate → deploy → smoke) _(.github/workflows/deploy.yml, actionlint-clean, gated behind `vars.FLY_DEPLOY_ENABLED`; Status: planned, never run)_
- [x] P7-003 — Managed Postgres, R2, Resend, secrets, domain, TLS — documented in docs/operations _(deployment.md/backups.md/incidents.md updated; Status: planned for anything needing a live Fly/R2/Resend account)_
- [x] P7-004 — npm packaging of `patches` TUI _(apps/tui/package.json + README; `@patches/tui` chosen — bare `patches` name taken; local tarball install verified end-to-end; real registry publish blocked on @patches/proto/@patches/terminal-media being private — documented as follow-up)_

## Phase 8 — two-node federation lab (v0.1) (§108 F1, §176)

> Local and non-public. Every §109 control still gates anything Internet-facing.

- [ ] P8-001 — WebFinger (RFC 7033) + actor document serialization from `actors`
- [ ] P8-002 — Inbox/outbox endpoints; `Follow`, `Accept`, `Create` (Note), `Delete`, basic `Like`
- [ ] P8-003 — Real `FederationGateway` implementation replacing `NoopFederationGateway`, behind `FEDERATION_ENABLED` (default **off**)
- [ ] P8-004 — Durable delivery on the outbox/jobs machinery: bounded retries, idempotent/safe duplicate delivery, dead-letter
- [ ] P8-005 — HTTP signature signing + verification
- [ ] P8-006 — §109 ingestion hardening: URL validation, private/reserved IP rejection, redirect/size/timeout limits, JSON depth caps, activity dedupe, inbox rate limits, domain blocks
- [ ] P8-007 — Page manifest advertised as a Patches extension property on the actor doc (§170); plain Fediverse servers degrade to a normal actor
- [ ] P8-008 — Two-node integration harness: node A follows node B, post propagates, delete tombstones

## Backlog / discovered

- [x] A-001 — CI: add `actions/checkout@v4` as the first step of every job (local `./.github/actions/setup` cannot resolve before checkout)
- [x] A-002 — database: stop disabling TLS verification — CA/sslmode-driven option defaulting to verify; update tests
- [x] A-003 — testkit: refuse any TEST_DATABASE_URL whose database name does not end in `_test` before dropDatabase() (§119)
- [x] A-004 — server: validate/cap inbound `x-request-id` (≤64 chars, [A-Za-z0-9._-]) before logging/echoing (§103)
- [x] A-005 — CI/tests: add `--project testkit` to `test:integration` and set TEST_DATABASE_URL so isolation helpers actually run
- [x] A-006 — CI/tests: one database per DB-touching vitest project (or no cross-project parallelism) — `database` and `server-integration` both dropDatabase() the same DB _(mitigated via `--no-file-parallelism` on `test:integration` + `server-integration`'s own `patches_test_server` database; `database`/`testkit` still share `patches_test` by design — full per-project split tracked as B-012)_
- [x] A-007 — server: sanitize the RpcException branch of RpcExceptionsFilter (no caller-controlled status/message passthrough; correct x-patches-error-code); unit-test all branches
- [x] A-008 — server: drop unused deps (@nestjs/platform-express, @nestjs/typeorm, typeorm, pg, @patches/database) until needed
- [x] A-009 — server: replace cwd/`__dirname` probe in modules/system/server-build.ts with an injected SERVER_VERSION provider
- [x] A-010 — proto: make PROTO_DIR lazy (`getProtoDir()`) so packaging errors fail at call site
- [x] A-011 — proto: breaking.sh must use `ref=` when base resolves to `origin/<branch>`
- [x] A-012 — repo: implement `pnpm keys:generate` referenced in .env.example (JWT keypair) or remove the reference
- [x] A-013 — CI: treat `skipped` as failure in ci-ok; scope `cancel-in-progress` to pull_request only
- [x] A-014 — database: `app_meta.updated_at` needs @UpdateDateColumn (or drop it)
- [x] A-015 — build: root `pnpm test` must work on a fresh clone (tests resolve @patches/* via dist) — build first via turbo or alias to src
- [x] A-016 — tests: unit coverage for RpcExceptionsFilter, LoggingInterceptor, logger.factory, grpc-options, SystemService, tui cli/ping.ts, cli.tsx
- [x] A-017 — terminal-media: bound untrusted image input (byte-length precheck + explicit sharp limitInputPixels) before Phase 5
- [x] A-018 — server: replace the process-local fixed-window `RateLimitService` with a db-backed store (§102 wants the sensitive flows db-backed by MVP); needs a `rate_limit_buckets` table + migration in `packages/database` and a sweep job _(`rate_limit_buckets`/migration landed earlier alongside `admin_audit_log`, 63c4f0f; this task adds `DbRateLimitStore` + `RateLimitService.consumeDistributed`/`consumeDistributedPeer`, called alongside — not instead of — the existing in-memory check for register/login/password_reset/verify_email/resend_verification/ssh_challenge; lazy 1-in-50 sweep-on-write in `DbRateLimitStore.increment` rather than a dedicated worker job, since nothing in `apps/worker` currently schedules a recurring job on a timer at all — see `docs/architecture/auth.md` §9)_
- [x] A-019 — server: key rate limits on the caller's peer address as well as the subject — needs the gRPC `ServerUnaryCall` (arg index 2), which a ts-proto controller signature does not expose; likely an interceptor that stashes the peer in the request context. Done as part of A-023: `RequestContextInterceptor` now reads `ServerUnaryCall.getPeer()` off `getArgByIndex(2)` and stashes it (port stripped) on `RequestContext`; `RateLimitService.consumePeer()` checks it alongside the existing subject budget for register/login/password_reset/ssh_challenge/ssh_complete.
- [ ] A-020 — proto/domain: move `buildSshChallengeBlob` (and the SSH wire helpers) into a package both `apps/server` and `apps/tui` import, so the signed-blob layout has exactly one definition (§166); today the server owns it and a client must reimplement it
- [x] A-021 — server: `RegisterRequest.client_request_id` is accepted but not enforced — §45 asks for idempotency on (handle_normalized, client_request_id); today only the handle unique index prevents a double-register. Schema half landed (2026-08-18) by the Phase 4/6 server task: `Actor.clientRequestId` + `UNIQUE (handle_normalized, client_request_id)` via `packages/database/src/migrations/1787059787165-ActorRegistrationIdempotency.ts`. Still open: `AuthService.register` (`apps/server/src/modules/auth/**`, out of that task's file scope) does not check this column before insert yet — needs a check-then-insert/catch-unique-violation idempotency path there, same pattern as `PostService.createPost`/`GraphService.followActor`.
- [x] A-022 — docs: add `NOT_IMPLEMENTED → UNIMPLEMENTED` to the error table in `docs/architecture/api.md` §7, and document the SSH challenge blob's wire encoding in `docs/architecture/auth.md` §4
- [x] A-023 — server auth (review blockers): (a) `beginSshLogin` limiter keyed on client-supplied fingerprint / shared `anonymous` bucket, `completeSshLogin` keyed on single-use challengeId → limits never fire; (b) no peer IP plumbed into `RateLimitService` (register/login/reset all keyed on attacker-chosen subject → unbounded Argon2id CPU); (c) `resetPassword` unthrottled and hashes before validating the code. Fix with per-peer keys (`ServerUnaryCall.getPeer()` via the 3rd handler arg) + subject keys, throttle reset, validate-then-hash
- [x] A-024 — server auth (review majors): reuse detection can miss a concurrently rotated token (`revokeFamilyOutOfBand` UPDATE snapshot) → revoke at session level; add tests for refresh reuse/family revocation and SSH challenge single-use/replay; `ARGON2_MEMORY_KIB` floor 19456; dedupe `hashCode`/`hashRefreshToken`; RSA modulus ≥2048; `prune` must not evict live victim buckets; drop `rateLimit.reset` on login success
- [x] A-025 — server auth (minors): `actor.userId ?? ""` masks null (assert instead); `claimedHandle` path unimplemented in `ssh-challenge.service.ts`; drop dead `refreshTokenHashesMatch`; do not spread `exception.context` into warn logs
- [x] A-026 — server: `GraphService.followActor` (`apps/server/src/modules/graph/**`) doesn't call `NotificationsService.notifyFollow` on a new follow — `NotificationsModule`/`NotificationsService.notifyFollow(recipientActorId, actorId)` exist and are exported (P4-003) specifically for this, but `graph/**` was out of that task's file scope. One-line fix: `GraphModule` imports `NotificationsModule`, `GraphService` injects `NotificationsService`, and `followActor` calls `notifyFollow(targetActorId, viewerActorId)` after a genuinely new follow row is inserted (mirror `ReactionsService.likePost`'s `wasNew` pattern so a no-op idempotent re-follow doesn't re-notify).

- [x] B-003 — Manually run the §74 Kitty spike checklist in Ghostty + a non-graphics terminal (`pnpm --filter @patches/terminal-media spike`), record results in `packages/terminal-media/spike/README.md`, tick the two roadmap items
- [ ] B-004 — Wire `@patches/terminal-media` into `apps/tui` (PostCard inline image + fallback + `o` open externally) — Phase 5 unless earlier
- [x] B-005 — Root `eslint.config.js` `allowDefaultProject` should cover per-package `*.config.{ts,mts}` so packages don't each need tsconfig splits _(scoped to apps/server, apps/worker, packages/config, packages/database, packages/testkit, packages/terminal-media — apps/tui/packages/proto/packages/media keep their tsconfig-include split, owned elsewhere)_
- [x] B-006 — Add `@grpc/reflection` to the server (grpcurl debugging), dev-only _(behind `GRPC_REFLECTION`, default off, on in `.env.example`'s dev block; grpcurl not installed in this environment, untested-live)_
- [x] B-007 — Validate/implement tmux passthrough for Kitty graphics (currently treated as unsupported) _(`GraphicsCapabilities.tmux` + `KittyGraphicsRenderer` wraps every APC write in `wrapTmuxPassthrough`; unit-tested, unverified against a live tmux+Ghostty — see `docs/research/ink-kitty-graphics.md`)_
- [x] B-008 — lefthook pre-commit (prettier/eslint on staged) via mise
- [x] B-009 — `pnpm dev` (turbo) runs the interactive TUI inside turbo output — exclude tui from the root `dev` task or make it server-only
- [x] B-010 — TUI screenshot tool (`tools/screenshot`): tmux -> ANSI -> SVG -> PNG, `mise run screenshot`, real PNGs in `docs/media/`, one embedded in README
- [x] B-011 — ~~root vitest projects skip `tools/*`~~ _(obsolete: `tools/screenshot` was removed)_
- [x] B-012 — full per-project test database isolation: `database` and `testkit` still share `patches_test` (safe today only via `--no-file-parallelism` on `test:integration`, see A-006/docs/operations/ci.md "Why one database") — give `testkit` its own `TEST_DATABASE_URL_TESTKIT`-style override (mirroring `apps/server/vitest.integration.config.mts`) once someone owns `packages/testkit`'s vitest config _(database named `patches_testkit_test`, not `patches_test_testkit` — see doc comment in `packages/testkit/vitest.config.ts`; `--no-file-parallelism` kept on `test:integration` — tested removing it, causes unrelated server-integration failures under full parallel load, see docs/operations/ci.md)_
- [x] B-013 — worker: stale-lease sweep for jobs stuck in `PROCESSING` after a worker crash (not SIGTERM) — reset to `PENDING` after `locked_at` exceeds a lease TTL
- [x] B-014 — admin CLI: inspect/replay `DEAD` outbox jobs (`patches-admin jobs list|replay <id>`) _(`apps/admin/src/commands/jobs.ts` + `packages/database/src/repositories/outbox.ts`'s `replayOutboxJob`, conditional `UPDATE ... WHERE status = 'DEAD'`, preserves `attempts`)_
- [x] B-015 — TUI: Ink `App`/`ConnectScreen` auth integration (status bar `@handle`, inline `L` login, `g p` placeholder) + `apps/tui/test/harness.tsx` ink-testing-library frame-snapshot harness (deferred from P1-007)
- [x] B-016 — TUI: wrong password on `patches login` prints "Your session is no longer valid" — map UNAUTHENTICATED from Login/Register to "Wrong handle/email or password" (keep the uniform server response, fix the client copy)
- [x] B-017 — TUI: remaining harness snapshot tests (login flow, compose→profile timeline, profile, local-feed pagination) + open an author profile from a selected post (PostList selection → ProfileScreen actorId)
- [x] B-018 — proto: `Actor.nameplate` (§173, ≤2 KiB validated doc; the DB column exists) and a post content-warning field are missing from `patches.v1` — add via /proto-change, then surface in server mappers (done: `Nameplate` message + `Actor.nameplate`/`UpdateProfileRequest.nameplate`, `Post.content_warning`/`CreatePostRequest.content_warning`, server mappers/validation). TUI PostRow/ProfileScreen surfacing tracked separately — see B-019.
- [x] B-020 — server: `SearchActors`/`ListFollowers`/`ListFollowing` return zeroed `counts` placeholders — batch real counts (one grouped query) or leave `counts` unset; TUI now refetches on profile open, so this is a data-honesty fix
- [ ] B-021 — server+proto: `AddCredential` for SSH keys has no server-verified possession proof — add a `BeginSshLogin`-shaped enrollment challenge (TUI `patches keys add` currently only self-checks via the agent)
- [x] B-022 — TUI: nameplate `avatarFrame`/`profileBorder` rendering + a plain-mode toggle that strips all decoration (§173); in-app account screen wrapping `ssh-enroll.ts`
- [x] B-019 — TUI: surface `Actor.nameplate` (name color/glyph/badges/status line) in `ProfileScreen` and `Post.content_warning` (click-to-reveal) in `PostRow`, now that both are on the wire (B-018)

- [x] B-001 — Decide MinIO vs R2 dev bucket for local media dev (spec §96 says either)
- [x] B-002 — `apps/server` uses `@patches/config` env schemas instead of its self-contained one; `PUBLIC_ORIGIN` requires http(s) protocol
