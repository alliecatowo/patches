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

## Phase 1 — persistence and auth (§135)

- [ ] P1-001 — Entities + migrations: users, actors, refresh_tokens, invites, verification codes, jobs/outbox
- [ ] P1-002 — `packages/config` env schema (zod) shared by server/worker/admin
- [ ] P1-003 — AuthService: register (invite-only), verify email, login, refresh (rotation + reuse detection), logout, logout-all, password reset request/reset
- [ ] P1-004 — Argon2id hashing, jose EdDSA JWT access tokens, opaque hashed refresh tokens
- [ ] P1-005 — Auth gRPC controller + auth guard/interceptor reading `authorization` metadata; error code mapping
- [ ] P1-006 — Outbox/jobs table + worker claim loop (SKIP LOCKED, backoff, dead-letter) + email jobs; EmailProvider (console/mailpit/resend)
- [ ] P1-007 — TUI: `patches register|login|logout`, CredentialStore (@napi-rs/keyring + guarded file fallback), auto-refresh
- [ ] P1-008 — Rate limiting for login/register/reset/verify (db-backed for sensitive flows)
- [ ] P1-009 — Tests: unit (token rotation, hashing, validation) + gRPC integration (register→verify→login→refresh)

## Phase 2 — posting (§136)

- [ ] P2-001 — posts, post_media entities + migrations; idempotent CreatePost (client_request_id)
- [ ] P2-002 — PostService/ActorService: CreatePost, GetPost, DeletePost (tombstone), UpdateProfile, GetActor(ByHandle), ListActorPosts
- [ ] P2-003 — TUI: profile screen, compose screen (explicit submit, draft not lost), profile timeline

## Phase 3 — social graph & feeds (§137)

- [ ] P3-001 — follows entity, Follow/Unfollow, ListFollowers/Following, SearchActors
- [ ] P3-002 — FeedService: ListHomeFeed / ListLocalFeed with keyset pagination, block/mute-aware SQL, indexes verified with EXPLAIN
- [ ] P3-003 — TUI: Home, Local, search, follow controls, `g h`/`g l` navigation, load-more

## Phase 4 — replies, reactions, notifications (§138)

- [ ] P4-001 — Threads: ListReplies (bounded depth + pagination), reply creation, root_post_id semantics
- [ ] P4-002 — likes, bookmarks entities + Reaction RPCs
- [ ] P4-003 — notifications rows (FOLLOW/LIKE/REPLY/MENTION/MODERATION), dedupe, ListNotifications/MarkRead
- [ ] P4-004 — TUI: thread screen, reply, like, bookmark, notifications screen

## Phase 5 — production media (§139)

- [ ] P5-001 — media entity, BeginMediaUpload (presigned PUT to R2), FinalizeMediaUpload, GetMediaDownload
- [ ] P5-002 — Worker PROCESS_MEDIA with sharp (validate, orient, strip, derivatives, hash)
- [ ] P5-003 — TUI: attach image path, upload progress, bounded LRU media cache, Kitty inline + fallback + `o` open externally

## Phase 6 — moderation & security (§140)

- [ ] P6-001 — blocks/mutes entities + RPCs + feed/API enforcement
- [ ] P6-002 — reports + ReportPost/ReportActor
- [ ] P6-003 — `apps/admin` CLI (invite/user/report/post commands) with admin_audit_log
- [ ] P6-004 — suspension enforcement, password reset end-to-end, validation sweep, URL scheme allowlist

## Phase 7 — deploy public v0 (§141)

- [ ] P7-001 — Multi-stage Dockerfile (server+worker, non-root), fly.toml (h2 gRPC, process groups, release_command migrations, checks)
- [ ] P7-002 — Deploy workflow (main → build → migrate → deploy → smoke)
- [ ] P7-003 — Managed Postgres, R2, Resend, secrets, domain, TLS — documented in docs/operations
- [ ] P7-004 — npm packaging of `patches` TUI

## Backlog / discovered

- [ ] A-001 — CI: add `actions/checkout@v4` as the first step of every job (local `./.github/actions/setup` cannot resolve before checkout)
- [ ] A-002 — database: stop disabling TLS verification — CA/sslmode-driven option defaulting to verify; update tests
- [ ] A-003 — testkit: refuse any TEST_DATABASE_URL whose database name does not end in `_test` before dropDatabase() (§119)
- [ ] A-004 — server: validate/cap inbound `x-request-id` (≤64 chars, [A-Za-z0-9._-]) before logging/echoing (§103)
- [ ] A-005 — CI/tests: add `--project testkit` to `test:integration` and set TEST_DATABASE_URL so isolation helpers actually run
- [ ] A-006 — CI/tests: one database per DB-touching vitest project (or no cross-project parallelism) — `database` and `server-integration` both dropDatabase() the same DB
- [ ] A-007 — server: sanitize the RpcException branch of RpcExceptionsFilter (no caller-controlled status/message passthrough; correct x-patches-error-code); unit-test all branches
- [ ] A-008 — server: drop unused deps (@nestjs/platform-express, @nestjs/typeorm, typeorm, pg, @patches/database) until needed
- [ ] A-009 — server: replace cwd/`__dirname` probe in modules/system/server-build.ts with an injected SERVER_VERSION provider
- [ ] A-010 — proto: make PROTO_DIR lazy (`getProtoDir()`) so packaging errors fail at call site
- [ ] A-011 — proto: breaking.sh must use `ref=` when base resolves to `origin/<branch>`
- [ ] A-012 — repo: implement `pnpm keys:generate` referenced in .env.example (JWT keypair) or remove the reference
- [ ] A-013 — CI: treat `skipped` as failure in ci-ok; scope `cancel-in-progress` to pull_request only
- [ ] A-014 — database: `app_meta.updated_at` needs @UpdateDateColumn (or drop it)
- [ ] A-015 — build: root `pnpm test` must work on a fresh clone (tests resolve @patches/* via dist) — build first via turbo or alias to src
- [ ] A-016 — tests: unit coverage for RpcExceptionsFilter, LoggingInterceptor, logger.factory, grpc-options, SystemService, tui cli/ping.ts, cli.tsx
- [ ] A-017 — terminal-media: bound untrusted image input (byte-length precheck + explicit sharp limitInputPixels) before Phase 5

- [x] B-003 — Manually run the §74 Kitty spike checklist in Ghostty + a non-graphics terminal (`pnpm --filter @patches/terminal-media spike`), record results in `packages/terminal-media/spike/README.md`, tick the two roadmap items
- [ ] B-004 — Wire `@patches/terminal-media` into `apps/tui` (PostCard inline image + fallback + `o` open externally) — Phase 5 unless earlier
- [ ] B-005 — Root `eslint.config.js` `allowDefaultProject` should cover per-package `*.config.{ts,mts}` so packages don't each need tsconfig splits
- [ ] B-006 — Add `@grpc/reflection` to the server (grpcurl debugging), dev-only
- [ ] B-007 — Validate/implement tmux passthrough for Kitty graphics (currently treated as unsupported)
- [ ] B-008 — lefthook pre-commit (prettier/eslint on staged) via mise
- [ ] B-009 — `pnpm dev` (turbo) runs the interactive TUI inside turbo output — exclude tui from the root `dev` task or make it server-only

- [ ] B-001 — Decide MinIO vs R2 dev bucket for local media dev (spec §96 says either)
- [x] B-002 — `apps/server` uses `@patches/config` env schemas instead of its self-contained one; `PUBLIC_ORIGIN` requires http(s) protocol
