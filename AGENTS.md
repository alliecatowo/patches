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

- The frontier root is the orchestrator and acceptance gate: turn explicit work into bounded tasks, delegate implementation rather than editing product or harness files itself when a worker can safely own it, review results, and integrate. It must not invent or automatically claim tasks; `tasks.md`, the user, and the spec define work.
- Assign exact owned and forbidden paths. Parallel work needs disjoint ownership; every brief says the checkout is shared and agents must preserve unrelated edits. Briefs are self-contained, short state packets (goal, constraints, paths, acceptance checks), and model overrides use a non-full-history fork whenever possible. Workers may delegate an independent mechanical subtask to a cheaper model, not a second coordinator.
- Pick a role before a model: `explorer`/`researcher` investigate, `worker`/`implementer` write owned paths, `verifier` runs checks, `reviewer` is read-only, and `architect` decides expensive-to-reverse questions. Use the cheapest adequate Codex model: Luna for high-volume/mechanical work and narrow diagnostics; Terra for normal implementation, tests, docs, and routine review; Sol only for architecture, crypto/security, hard debugging, or high-risk final review. Tailored roles keep their configured effort.
- An independent reviewer must have strictly stronger effective capability than the implementer: e.g. low/medium Terra work → high Terra review; high Terra or risky cross-cutting work → Sol review. Do not use Sol implementation where independent stronger review is required. A verifier reports the relevant checks; implementation remains accountable for fixing failures.
- See `docs/agents/MODEL_ROUTING.md` for the routing table and `docs/agents/HARNESS.md` for the cross-client contract. If the same approach fails twice, change the approach or escalate; never weaken hard rules, silently broaden scope, or create a chain of coordinators.

## Repository map

`apps/server` (Nest gRPC), `apps/worker` (jobs), `apps/tui` (Ink), `apps/web` (React), `apps/admin`, `packages/proto`, `packages/database`, `packages/domain`, `packages/config`, `packages/observability`, `packages/media`, `packages/crypto`, `packages/testkit`, `infra/`, `docs/`.

Context-economy measurements: `docs/agents/CONTEXT_ECONOMY.md` (`mise run usage`). Package conventions: `docs/agents/PACKAGE_CONVENTIONS.md`. A harness edit (agents/rules/hooks) never weakens a hard rule above — that needs an ADR and human sign-off.
