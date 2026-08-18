# tasks.md — live task board

Conventions: `- [ ] ID — description` · IDs are `P<phase>-<nnn>` (H = harness, B = backlog/discovered, A = audit findings).
Check off with `- [x]`. Add a trailing `(#issue)` when mirrored to GitHub. Keep the newest audit findings at the top of
**Backlog**. When a phase's tasks are all done, run `/audit` before starting the next phase. Managed via `/task`.

## Harness

- [x] H-001 — CLAUDE.md operating manual
- [x] H-002 — `.claude/settings.json` with pnpm-only guard, prettier post-edit hook, session-start summary
- [ ] H-003 — Agent roster in `.claude/agents/` (researcher, implementer, reviewer, architect, verifier, docs, spec-auditor)
- [ ] H-004 — Skills: `/task`, `/verify`, `/retro`, `/audit`, `/proto-change`, `/migration`, `/phase`
- [ ] H-005 — Path-scoped rules in `.claude/rules/` (server, tui, proto, database)
- [ ] H-006 — `docs/agents/HARNESS.md`, `LEARNINGS.md`, `MODEL_ROUTING.md`

## Phase 0 — repository and risk spikes (spec §134, §157)

- [x] P0-001 — Pin toolchain in `mise.toml` (node 24, pnpm 11, buf, docker-compose provider, actionlint)
- [ ] P0-002 — Repo hygiene: LICENSE, CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, issue/PR templates, CODEOWNERS, .editorconfig, .gitignore
- [ ] P0-003 — Product/architecture/ops docs + ADRs 0001–0010 (`docs/`)
- [ ] P0-004 — Research notes for every risky tech (`docs/research/`)
- [ ] P0-005 — Monorepo scaffold: pnpm workspace + catalog, turbo.json, tsconfig.base, eslint flat config, prettier, vitest projects, root scripts
- [ ] P0-006 — `infra/compose`: postgres 17 + mailpit (+ optional minio); `mise run compose` wrapper; `.env.example`
- [ ] P0-007 — `packages/proto`: buf v2 config, `patches/v1/common.proto` + `health`/hello slice, ts-proto generation committed, lint/format/breaking scripts
- [ ] P0-008 — `apps/server`: Nest 11 gRPC microservice hello-world (`patches.v1.PingService`?) with config validation, JSON logger, graceful shutdown, health
- [ ] P0-009 — `apps/tui`: Ink 7 hello-world that performs a real gRPC call to the server with deadline + metadata; renders errors cleanly; fullscreen + clean exit
- [ ] P0-010 — Kitty graphics spike: detect capability, render test image via unicode placeholders inside Ink list, survive rerender/scroll/resize, clear on exit; fallback box
- [ ] P0-011 — `packages/database`: TypeORM 1.x DataSource, snake naming strategy, migration scripts wired (`pnpm db:*`), smoke migration + test against real Postgres
- [ ] P0-012 — GitHub Actions CI: format, lint, typecheck, buf lint/format/breaking, build, unit, integration (postgres service), migration check; dependabot
- [ ] P0-013 — README with real, verified first-run commands
- [ ] P0-014 — Phase 0 acceptance checklist (§157) verified end-to-end and recorded in `docs/product/roadmap.md`

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

- [ ] B-001 — Decide MinIO vs R2 dev bucket for local media dev (spec §96 says either)
