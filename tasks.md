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

- [ ] P1-001 — Entities + migrations: actors (incl. `moved_to_uri`, `also_known_as`, `nameplate`), users (no password_hash; nullable recovery_email), **credentials**, **ssh_login_challenges**, refresh_tokens, invites, verification codes, jobs/outbox
- [ ] P1-002 — `packages/config` env schema (zod) shared by server/worker/admin
- [ ] P1-003 — AuthService: register (invite-only, optional initial credential), verify email, password login, refresh (rotation + reuse detection), logout, logout-all, password reset request/reset
- [ ] P1-004 — Argon2id hashing on `credentials.secret_hash`, jose EdDSA JWT access tokens, opaque hashed refresh tokens
- [ ] P1-005 — Auth gRPC controller + auth guard/interceptor reading `authorization` metadata; error code mapping
- [ ] P1-006 — Outbox/jobs table + worker claim loop (SKIP LOCKED, backoff, dead-letter) + email jobs; EmailProvider (console/mailpit/resend)
- [ ] P1-007 — TUI: `patches register|login|logout|accounts`, CredentialStore keyed by **node origin + user id** (@napi-rs/keyring + guarded file fallback), auto-refresh
- [ ] P1-008 — Rate limiting for login/register/reset/verify/challenge-issuance (db-backed for sensitive flows)
- [ ] P1-009 — Tests: unit (token rotation, hashing, validation) + gRPC integration (register→verify→login→refresh)
- [ ] P1-010 — Research note `docs/research/ssh-signature-verification.md`: which Node library verifies OpenSSH-format public-key signatures, verified against official docs (blocks P1-011)
- [ ] P1-011 — SSH challenge auth: `BeginSshLogin`/`CompleteSshLogin`, `ssh_login_challenges`, blob binding (purpose + node domain + challenge id + nonce ≥32B + fingerprint + expiry), single-use TTL ≤120s, ed25519 first, SHA-1 `ssh-rsa` rejected (§166)
- [ ] P1-012 — Credential management RPCs: `ListCredentials` (never returns `secret_hash`), `AddCredential` (requires authenticated session), `RevokeCredential` (fails on last active credential)
- [ ] P1-013 — TUI SSH enrollment: enumerate ssh-agent identities + `~/.ssh/*.pub`, explicit confirm, sign via `SSH_AGENTC_SIGN_REQUEST`; **never read/transmit a private key**
- [ ] P1-014 — `NodeService.GetNodeInfo` (unauthenticated): node domain, version, registration mode, limits, capabilities (§174) — no `tier` field, ever
- [ ] P1-015 — Security tests: challenge replay + cross-node replay + expiry, algorithm downgrade, credential enumeration (uniform failures), last-credential revocation

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

## Phase 4.5 — Pages v1 (§170–§172)

- [ ] P45-001 — `PatchesPage` schema + validator in `packages/domain` (versioned, flat blocks, strict-on-write); limits: doc ≤64 KiB, ≤32 sub-pages, ≤128 blocks/page, ≤8 KiB/block
- [ ] P45-002 — Entities + migrations: pages, page_revisions (immutable), page_assets, guestbook_entries
- [ ] P45-003 — `PageService`: GetPage, UpdatePage (new revision per write), ListGuestbook, SignGuestbook (rate-limited, block-aware, reportable, owner/moderator removal)
- [ ] P45-004 — Ink page renderer + basic theme; blocks Text/Markdown/Links/Posts/TopEight/Guestbook; unknown blocks render a placeholder, never fail the page
- [ ] P45-005 — `Image`/`Gallery` defined in schema but render as placeholder until Phase 5 media exists (§176)
- [ ] P45-006 — TUI `patches visit @handle[/slug]` + page editor
- [ ] P45-007 — Nameplate rendering everywhere a name appears: capability degradation (truecolor→256→16→none), plain mode, server-attested badges only (§173)
- [ ] P45-008 — Security tests: no executable code path, control-character/escape-sequence stripping on every user string, remote-URL media rejected, `javascript:`/`data:`/`file:` links rejected

## Phase 5 — production media (§139)

- [ ] P5-001 — media entity, BeginMediaUpload (presigned PUT to R2), FinalizeMediaUpload, GetMediaDownload
- [ ] P5-002 — Worker PROCESS_MEDIA with sharp (validate, orient, strip, derivatives, hash)
- [ ] P5-003 — TUI: attach image path, upload progress, bounded LRU media cache, Kitty inline + fallback + `o` open externally

## Phase 6 — moderation & security (§140)

- [ ] P6-001 — blocks/mutes entities + RPCs + feed/API enforcement
- [ ] P6-002 — reports + ReportPost/ReportActor
- [ ] P6-003 — `apps/admin` CLI (invite/user/report/post commands) with admin_audit_log
- [ ] P6-004 — suspension enforcement, password reset end-to-end, validation sweep, URL scheme allowlist
- [ ] P6-005 — GitHub credential via OAuth **device flow** (§167): `BeginGitHubLogin`/`PollGitHubLogin`, identifier = numeric account id (never login name), token discarded after reading the id, linking requires an authenticated session, honor `interval`/`slow_down`

## Phase 7 — deploy public v0 (§141)

- [ ] P7-001 — Multi-stage Dockerfile (server+worker, non-root), fly.toml (h2 gRPC, process groups, release_command migrations, checks)
- [ ] P7-002 — Deploy workflow (main → build → migrate → deploy → smoke)
- [ ] P7-003 — Managed Postgres, R2, Resend, secrets, domain, TLS — documented in docs/operations
- [ ] P7-004 — npm packaging of `patches` TUI

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
- [ ] A-002 — database: stop disabling TLS verification — CA/sslmode-driven option defaulting to verify; update tests
- [ ] A-003 — testkit: refuse any TEST_DATABASE_URL whose database name does not end in `_test` before dropDatabase() (§119)
- [x] A-004 — server: validate/cap inbound `x-request-id` (≤64 chars, [A-Za-z0-9._-]) before logging/echoing (§103)
- [x] A-005 — CI/tests: add `--project testkit` to `test:integration` and set TEST_DATABASE_URL so isolation helpers actually run
- [x] A-006 — CI/tests: one database per DB-touching vitest project (or no cross-project parallelism) — `database` and `server-integration` both dropDatabase() the same DB _(mitigated via `--no-file-parallelism` on `test:integration` + `server-integration`'s own `patches_test_server` database; `database`/`testkit` still share `patches_test` by design — full per-project split tracked as B-012)_
- [x] A-007 — server: sanitize the RpcException branch of RpcExceptionsFilter (no caller-controlled status/message passthrough; correct x-patches-error-code); unit-test all branches
- [x] A-008 — server: drop unused deps (@nestjs/platform-express, @nestjs/typeorm, typeorm, pg, @patches/database) until needed
- [x] A-009 — server: replace cwd/`__dirname` probe in modules/system/server-build.ts with an injected SERVER_VERSION provider
- [ ] A-010 — proto: make PROTO_DIR lazy (`getProtoDir()`) so packaging errors fail at call site
- [ ] A-011 — proto: breaking.sh must use `ref=` when base resolves to `origin/<branch>`
- [ ] A-012 — repo: implement `pnpm keys:generate` referenced in .env.example (JWT keypair) or remove the reference
- [x] A-013 — CI: treat `skipped` as failure in ci-ok; scope `cancel-in-progress` to pull_request only
- [ ] A-014 — database: `app_meta.updated_at` needs @UpdateDateColumn (or drop it)
- [x] A-015 — build: root `pnpm test` must work on a fresh clone (tests resolve @patches/* via dist) — build first via turbo or alias to src
- [x] A-016 — tests: unit coverage for RpcExceptionsFilter, LoggingInterceptor, logger.factory, grpc-options, SystemService, tui cli/ping.ts, cli.tsx
- [x] A-017 — terminal-media: bound untrusted image input (byte-length precheck + explicit sharp limitInputPixels) before Phase 5

- [x] B-003 — Manually run the §74 Kitty spike checklist in Ghostty + a non-graphics terminal (`pnpm --filter @patches/terminal-media spike`), record results in `packages/terminal-media/spike/README.md`, tick the two roadmap items
- [ ] B-004 — Wire `@patches/terminal-media` into `apps/tui` (PostCard inline image + fallback + `o` open externally) — Phase 5 unless earlier
- [ ] B-005 — Root `eslint.config.js` `allowDefaultProject` should cover per-package `*.config.{ts,mts}` so packages don't each need tsconfig splits
- [ ] B-006 — Add `@grpc/reflection` to the server (grpcurl debugging), dev-only
- [ ] B-007 — Validate/implement tmux passthrough for Kitty graphics (currently treated as unsupported)
- [ ] B-008 — lefthook pre-commit (prettier/eslint on staged) via mise
- [ ] B-009 — `pnpm dev` (turbo) runs the interactive TUI inside turbo output — exclude tui from the root `dev` task or make it server-only
- [x] B-010 — TUI screenshot tool (`tools/screenshot`): tmux -> ANSI -> SVG -> PNG, `mise run screenshot`, real PNGs in `docs/media/`, one embedded in README
- [ ] B-011 — root `vitest.config.ts` `projects` doesn't include `tools/*`, so `pnpm test`/`pnpm verify` skip `tools/screenshot`'s tests (they still run standalone via `pnpm --filter @patches/tools-screenshot test`)
- [ ] B-012 — full per-project test database isolation: `database` and `testkit` still share `patches_test` (safe today only via `--no-file-parallelism` on `test:integration`, see A-006/docs/operations/ci.md "Why one database") — give `testkit` its own `TEST_DATABASE_URL_TESTKIT`-style override (mirroring `apps/server/vitest.integration.config.mts`) once someone owns `packages/testkit`'s vitest config

- [ ] B-001 — Decide MinIO vs R2 dev bucket for local media dev (spec §96 says either)
- [x] B-002 — `apps/server` uses `@patches/config` env schemas instead of its self-contained one; `PUBLIC_ORIGIN` requires http(s) protocol
