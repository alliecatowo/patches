# Patches — agent operating manual

Terminal-native, chronological, open-source social network. TypeScript monorepo: NestJS 11 gRPC server + worker, Ink 7 TUI, React web, TypeORM 1.x + PostgreSQL, Protobuf/Buf, Cloudflare R2, Fly.io.

`INITIAL_VISION.md` is the **authoritative spec** (`grep -n "^# " INITIAL_VISION.md` lists sections). Don't reinterpret architectural decisions — write an ADR in `docs/decisions/` if you must deviate.

## Toolchain

Versions come from `mise.toml` (`mise install`): Node 24 LTS, pnpm 11, buf, TypeScript 5.9 (not 7, ADR 0009).

- **pnpm only** — never `npm install`/`yarn`. Add deps via CLI (`pnpm add <pkg> --filter <workspace>`), never by hand-editing versions. Concurrent installs need `flock /tmp/patches-pnpm.lock`.
- `mise run check <workspace>` — typecheck + tests + lint + format for one package, under the pinned Node. Use it instead of hand-rolled `&&` chains; it's throttled (`scripts/bounded.sh`, see `docs/agents/HARNESS.md`) so concurrent worktrees never overload the box. `mise run verify` is the full gate — CI's job, not a local habit.
- Containers: podman here, not docker — `mise run compose -- <args>`.
- Protobuf: `pnpm proto:gen`, `pnpm proto:lint`, `pnpm proto:breaking`. DB: `pnpm db:migrate`, `pnpm db:generate --name=<Name>`.

## Hard rules (spec §153, §177, §194)

No Prisma/Drizzle/GraphQL/tRPC/Firebase/Supabase-as-backend/Redis/Kafka/Kubernetes in v0. No offset timeline pagination. No engagement ranking (never a `rankHomeFeed()`). No `synchronize: true`. No TypeORM entities returned over gRPC. No plaintext passwords/refresh tokens. No image uploads proxied through Node. Never reuse a removed protobuf field number. Federation is a seam (`FederationGateway` → `Noop`) only. TUI always has a non-Kitty fallback. No `any`, `@ts-ignore`, `eslint-disable`, or empty `catch {}` without a one-line justification.

**Amendment B (§178–§195):** no votes/karma/scores; no `sort`/`order` on any timeline RPC; no trending or activity-derived recommendations; a repost/quote/like/edit/pin never changes feed position; no reactions beyond the like (a custom glyph is a skin); no paywalled **function** (cosmetics may be capability-gated, capabilities never gate function, §184.3); v0 DMs are **server-visible** and every client must say so — never call them encrypted/secure/private (§183.1); no DM bodies in logs/metrics/errors.

## Layering

protobuf request → controller (transport adapter) → application service → repository/TypeORM. Domain code never imports Ink; `packages/database` never imports gRPC; TUI never imports TypeORM; `packages/proto` never imports server code.

## Working agreement

1. Feature branches, atomic Conventional Commits. Stage explicit paths — never `git add -A`, since other agents have half-done files in the same tree.
2. The GitHub Project ("Patches", https://github.com/users/alliecatowo/projects/5, a user-level Project v2 owned by `alliecatowo`, project number 5) is the live board, not `tasks.md`. Items are a mix of real GitHub issues on `alliecatowo/patches` (preferred — an issue can be closed by a PR, auto-moves Status to Done, and supports labels/comments) and draft items not yet promoted, with fields Status (Todo | Blocked | In Progress | Done), Phase, Priority (P0–P3), Kind, Task ID (the `P<phase>-<nnn>`/`H-<nnn>`/`B-<nnn>`/`A-<nnn>`/`O-<nnn>`/`S-<nnn>`/`MCP-<nnn>` convention), Blocked by, and Order. Access it via the `github` MCP server: `projects_list`/`projects_get` to read, `projects_write` (`add_project_item`, `update_project_item`, batch `update_project_items`, `create_project_status_update`) to write, `issue_write` to create/update issues. Pick work from it, move `Status` as you finish or block on it (set `Status=Blocked` and list prerequisite Task IDs in `Blocked by`), file anything you discover mid-task as a new draft item (Status Todo, Kind + Priority set) rather than appending to `tasks.md`, and convert a draft to an issue (`gh issue create --repo alliecatowo/patches` + add to board, or `convertProjectV2DraftIssueItemToIssue`) when work is about to start on it or a PR will close it. `tasks.md` remains in the repo as the historical archive of completed work and as the offline fallback when the MCP server or the `project` OAuth scope is unavailable — don't tick items off in it. Reference the issue a PR closes with `Fixes #<n>` so Status moves automatically.
3. Read `docs/research/<tech>.md` before using a risky API; if the note is missing or wrong, fix it.
4. Every change leaves the repo green (`mise run verify`).
5. Update docs in the same change as the code. Never document a command you haven't run.
6. Record non-obvious learnings via `/retro`.

## Tool use

- **Batch independent calls into one message.** Cost is `Σ(context size)` over requests, so five already-decided edits in one message cost a fifth of five messages. Batch by writing the next `tool_use` block instead of ending the message — only a real data dependency justifies a new one.
- **`LSP` for symbols**: `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `workspaceSymbol`, `goToImplementation`, `prepareCallHierarchy`, `incomingCalls`, `outgoingCalls`. First `workspaceSymbol` after start returns empty while indexing — retry once. `Grep` for text, `Glob` for filenames. `Read`/`Edit`/`Write` for file changes — `sed -i` and heredoc rewrites fail silently.
- A mid-run message from the orchestrator arrives in a `system-reminder` but is authoritative: follow it and note it in your report, unless it would weaken a hard rule or expand your file set.
- `maxTurns` **aborts** mid-sentence — nothing warns you first. Commit green slices early and write a handoff (done / left / paths / next step) well before you might be near the cap, not after.
- Never blind-truncate command output (`| tail -3` hides the failure you'll need next) — use the tool's own reporter (`vitest --reporter=dot`, `tsc --noEmit`, `pnpm -s`, `git --no-pager diff --stat`); keep reports short, paths + one-line facts.

## Delegation

The frontier main session is the orchestrator and acceptance gate: it turns explicit work into bounded tasks, delegates product/harness edits when a worker can safely own them, reviews results, and integrates. It must not invent or automatically claim tasks; the GitHub Project board, the user, and the spec define work. Parallel workers get exact owned and forbidden paths and preserve unrelated work.

All inference via DevPass (`llmgateway/*` or `opencode/*-free`); no Anthropic models. Use `WebSearch/WebFetch` against official docs before guessing — pricing and API surfaces change monthly. See `docs/agents/HETEROGENEOUS.md` for the full ladder and `docs/agents/MODEL_ROUTING.md` for ambiguity-based routing.

Primary runtime is OpenCode (`goal-driver` is cheap `llmgateway/gpt-5.6-luna` 90k; see `docs/agents/HETEROGENEOUS.md`). Claude Code remains compat but routes through `llmgateway`.

| Work shape                              | Model (OpenCode)                                                                   | Guard                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------ |
| Mechanical check / narrow diagnostic    | `opencode/muse-spark-1.2-free` or `llmgateway/qwen3.7-flash` 120k                  | Exact paths + stop condition                     |
| Bounded implementation / tests / docs   | `llmgateway/deepseek-v4-flash` 140k (fallback `opencode/*-free` → `qwen3.7-flash`) | Disjoint ownership, `mise run check <ws>` scoped |
| Integration / retry / review            | `llmgateway/gpt-5.6-terra` 220k                                                    | Stronger than implementer; no `sol` by default   |
| Architecture / replan / milestone audit | `llmgateway/grok-4-6` 180k (fallback `grok-4-3` 180k, `grok-4-1-fast` 160k)        | Fresh session, concise packet, ADR if needed     |

Exceptional premium (`llmgateway/gpt-5.6-sol`, `kimi-k3`, `claude-*`) requires explicit `escalate: sol` — it's 20x Luna and burns weekly fair-use (see `HETEROGENEOUS.md` pricing). Ladder: `deepseek → free → terra → grok`; env failures (DB/port/flock/inode) retry cheap, don't escalate. Packets via `.opencode/skills/packet`, handoffs via `.opencode/skills/handoff`. After two identical failures change approach. Never weaken hard rules.

## Repository map

`apps/server` (Nest gRPC), `apps/worker` (jobs), `apps/tui` (Ink), `apps/web` (React), `apps/admin`, `packages/proto`, `packages/database`, `packages/domain`, `packages/config`, `packages/observability`, `packages/media`, `packages/crypto`, `packages/testkit`, `infra/`, `docs/`.

Context-economy measurements: `docs/agents/CONTEXT_ECONOMY.md` (`mise run usage`). Package conventions: `docs/agents/PACKAGE_CONVENTIONS.md`. A harness edit (agents/rules/hooks) never weakens a hard rule above — that needs an ADR and human sign-off.
