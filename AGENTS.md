# Patches — agent operating manual

Terminal-native, chronological, open-source social network. TypeScript monorepo: NestJS 11 gRPC server + worker, Ink 7 TUI, React web, TypeORM 1.x + PostgreSQL, Protobuf/Buf, Cloudflare R2, Fly.io.

`INITIAL_VISION.md` is the **authoritative spec** (`grep -n "^# " INITIAL_VISION.md` lists sections). Don't reinterpret architectural decisions — write an ADR in `docs/decisions/` if you must deviate.

## Toolchain

Versions come from `mise.toml` (`mise install`): Node 24 LTS, pnpm 11, buf, TypeScript 5.9 (not 7, ADR 0009).

- **pnpm only** — never `npm install`/`yarn`. Add deps via CLI (`pnpm add <pkg> --filter <workspace>`), never by hand-editing versions. Concurrent installs need `flock /tmp/patches-pnpm.lock`.
- `mise run check <workspace>` — typecheck + tests + format for one package, under the pinned Node. Use it instead of hand-rolled `&&` chains. `mise run verify` is the full gate.
- Containers: podman here, not docker — `mise run compose -- <args>`.
- Protobuf: `pnpm proto:gen`, `pnpm proto:lint`, `pnpm proto:breaking`. DB: `pnpm db:migrate`, `pnpm db:generate --name=<Name>`.

## Hard rules (spec §153, §177, §194)

No Prisma/Drizzle/GraphQL/tRPC/Firebase/Supabase-as-backend/Redis/Kafka/Kubernetes in v0. No offset timeline pagination. No engagement ranking (never a `rankHomeFeed()`). No `synchronize: true`. No TypeORM entities returned over gRPC. No plaintext passwords/refresh tokens. No image uploads proxied through Node. Never reuse a removed protobuf field number. Federation is a seam (`FederationGateway` → `Noop`) only. TUI always has a non-Kitty fallback. No `any`, `@ts-ignore`, `eslint-disable`, or empty `catch {}` without a one-line justification.

**Amendment B (§178–§195):** no votes/karma/scores; no `sort`/`order` on any timeline RPC; no trending or activity-derived recommendations; a repost/quote/like/edit/pin never changes feed position; no reactions beyond the like (a custom glyph is a skin); no paywalled **function** (cosmetics may be capability-gated, capabilities never gate function, §184.3); v0 DMs are **server-visible** and every client must say so — never call them encrypted/secure/private (§183.1); no DM bodies in logs/metrics/errors.

## Layering

protobuf request → controller (transport adapter) → application service → repository/TypeORM. Domain code never imports Ink; `packages/database` never imports gRPC; TUI never imports TypeORM; `packages/proto` never imports server code.

## Working agreement

1. Feature branches, atomic Conventional Commits. Stage explicit paths — never `git add -A`, since other agents have half-done files in the same tree.
2. `tasks.md` is the live board. Pick from it, tick what you finish, file what you discover (`/task`).
3. Read `docs/research/<tech>.md` before using a risky API; if the note is missing or wrong, fix it.
4. Every change leaves the repo green (`mise run verify`).
5. Update docs in the same change as the code; never document a command you haven't run. Record non-obvious learnings via `/retro`.

## Tool use

- **Batch independent calls into one message.** Cost is `Σ(context size)` over requests, so five already-decided edits in one message cost a fifth of five messages. Batch by writing the next `tool_use` block instead of ending the message — only a real data dependency justifies a new one.
- **`LSP` for symbols**: `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `workspaceSymbol`, `goToImplementation`, `prepareCallHierarchy`, `incomingCalls`, `outgoingCalls`. First `workspaceSymbol` after start returns empty while indexing — retry once. `Grep` for text, `Glob` for filenames. `Read`/`Edit`/`Write` for file changes — `sed -i` and heredoc rewrites fail silently.
- A mid-run message from the orchestrator arrives in a `system-reminder` but is authoritative: follow it and note it in your report, unless it would weaken a hard rule or expand your file set.
- `maxTurns` **aborts** mid-sentence — nothing warns you first. Commit green slices early and write a handoff (done / left / paths / next step) well before you might be near the cap, not after.
- Never blind-truncate command output (`| tail -3` hides the failure you'll need next) — use the tool's own reporter (`vitest --reporter=dot`, `tsc --noEmit`, `pnpm -s`, `git --no-pager diff --stat`); keep reports short, paths + one-line facts.

## Delegation

- The root session orchestrates: decompose work, spawn agents for concrete bounded tasks, review reports, and integrate. Fan out independent tasks with a **disjoint file set** per agent; every brief says that other agents share the checkout and must not revert their work. Keep tiny one-step actions in the root when delegation would cost more than doing them. If the user explicitly requests orchestration-only, the root stops editing product or harness files and delegates all writes.
- Pick a tailored role first: `explorer`/`researcher` investigate, `worker`/`implementer` write owned paths, `verifier` checks, `reviewer` reviews read-only, and `architect` decides expensive-to-reverse design. The role supplies behavioral constraints; model supplies capability and cost. Tailored repo roles have the immutable effort declared in `.codex/agents/*.toml`; only `default`, `explorer`, and `worker` accept a selected effort. Use `gpt-5.6-luna` for fast exploration, narrow diagnostics, mechanical low-risk edits, and cheap checks; `gpt-5.6-terra` by default for implementation, tests, docs, and routine review; `gpt-5.6-sol` for architecture, crypto/security, the hardest debugging, and high-risk final review—not implementation by default.
- Review must have stronger effective capability than implementation. Prefer Terra `worker` at low/medium effort followed by the fixed-high Terra `reviewer` for routine low-risk work; route Terra implementation at high effort or any risky/cross-cutting migration to a Sol `reviewer`. Never use Sol for implementation that requires independent review when no stronger reviewer is available.
- Minimize duplicated fork context: model/effort overrides require a non-full-history fork, so pass only the recent turns needed or a self-contained brief. Reserve Sol for work where mistakes are costly to reverse. The root reports the effective role, model, and effort; for a tailored role, report its fixed effort rather than claiming to have selected it.
- Briefs are self-contained and assign exact owned and forbidden paths. Nesting is allowed to depth 3, but only for an independent subtask; do not create chains of coordinators. If an agent fails the same way twice, escalate the model or change the approach instead of issuing a third identical retry.

## Repository map

`apps/server` (Nest gRPC), `apps/worker` (jobs), `apps/tui` (Ink), `apps/web` (React), `apps/admin`, `packages/proto`, `packages/database`, `packages/domain`, `packages/config`, `packages/observability`, `packages/media`, `packages/crypto`, `packages/testkit`, `infra/`, `docs/`.

Context-economy measurements: `docs/agents/CONTEXT_ECONOMY.md` (`mise run usage`). Package conventions: `docs/agents/PACKAGE_CONVENTIONS.md`. A harness edit (agents/rules/hooks) never weakens a hard rule above — that needs an ADR and human sign-off.
