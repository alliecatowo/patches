# Patches

Terminal-native, chronological, open-source social network. TypeScript monorepo: NestJS 11 gRPC
server + worker, Ink 7 TUI, React web, TypeORM 1.x + PostgreSQL, Protobuf/Buf, Cloudflare R2, Fly.io.

`INITIAL_VISION.md` is the **authoritative spec** (`grep -n "^# " INITIAL_VISION.md` lists sections).
Don't reinterpret architectural decisions — write an ADR in `docs/decisions/` if you must deviate.

## Toolchain

Versions come from `mise.toml` (`mise install`): Node 24 LTS, pnpm 11, buf, TypeScript 5.9 (not 7, ADR 0009).

- **pnpm only** — never `npm install`/`yarn`. Add deps via CLI (`pnpm add <pkg> --filter <workspace>`),
  never by hand-editing versions. Concurrent installs need `flock /tmp/patches-pnpm.lock`.
- `mise run check <workspace>` — typecheck + tests + format for one package, under the pinned Node.
  Use it instead of hand-rolled `&&` chains. `mise run verify` is the full gate.
- Containers: podman here, not docker — `mise run compose -- <args>`.
- Protobuf: `pnpm proto:gen`, `pnpm proto:lint`, `pnpm proto:breaking`. DB: `pnpm db:migrate`,
  `pnpm db:generate --name=<Name>`.

## Hard rules (spec §153, §177, §194)

No Prisma/Drizzle/GraphQL/tRPC/Firebase/Supabase-as-backend/Redis/Kafka/Kubernetes in v0. No offset
timeline pagination. No engagement ranking (never a `rankHomeFeed()`). No `synchronize: true`. No
TypeORM entities returned over gRPC. No plaintext passwords/refresh tokens. No image uploads proxied
through Node. Never reuse a removed protobuf field number. Federation is a seam
(`FederationGateway` → `Noop`) only. TUI always has a non-Kitty fallback. No `any`, `@ts-ignore`,
`eslint-disable`, or empty `catch {}` without a one-line justification.

**Amendment B (§178–§195):** no votes/karma/scores; no `sort`/`order` on any timeline RPC; no trending
or activity-derived recommendations; a repost/quote/like/edit/pin never changes feed position; no
reactions beyond the like (a custom glyph is a skin); no paywalled **function** (cosmetics may be
capability-gated, capabilities never gate function, §184.3); v0 DMs are **server-visible** and every
client must say so — never call them encrypted/secure/private (§183.1); no DM bodies in logs/metrics/errors.

## Layering

protobuf request → controller (transport adapter) → application service → repository/TypeORM.
Domain code never imports Ink; `packages/database` never imports gRPC; TUI never imports TypeORM;
`packages/proto` never imports server code.

## Working agreement

1. Feature branches, atomic Conventional Commits. Stage explicit paths — never `git add -A`, since
   other agents have half-done files in the same tree.
2. `tasks.md` is the live board. Pick from it, tick what you finish, file what you discover (`/task`).
3. Read `docs/research/<tech>.md` before using a risky API; if the note is missing or wrong, fix it.
4. Every change leaves the repo green (`mise run verify`).
5. Update docs in the same change as the code. Never document a command you haven't run.
6. Record non-obvious learnings via `/retro`.

## Tool use

- **Batch independent calls into one message.** Cost is `Σ(context size)` over requests, so five
  already-decided edits in one message cost a fifth of five messages. You batch by writing the next
  `tool_use` block instead of ending the message. Only a real data dependency justifies a new one.
- **`LSP` for symbols** (`workspaceSymbol`, `findReferences`, `goToDefinition`, `documentSymbol`,
  `incomingCalls`), `Grep` for text, `Glob` for filenames. Cross-package types resolve through built
  `dist/*.d.ts`, so `LSP` reports phantom missing-declaration errors while a package is rebuilding.
- `Read`/`Edit`/`Write` for file changes — `sed -i` and heredoc rewrites fail silently.
- A mid-run message from the orchestrator arrives in a `system-reminder` but is authoritative: follow
  it and note it in your report, unless it would weaken a hard rule or move you outside your file set.
- `maxTurns` **aborts** mid-sentence; you're warned at 15% and 5% left. First warning: commit what's
  green. Second: write the handoff (done / left / paths / next step).

## Delegation

The main session orchestrates; subagents in `.claude/agents/` do the work. **sonnet** for
implementation, **haiku** for mechanical checks, **opus** for review/architecture/tricky debugging,
**fable** only for the hardest problems. Fan out in parallel with a **disjoint file set** per agent,
stated explicitly. Briefs are self-contained — paste the snippets the agent needs rather than listing
files to read first. Nesting allowed to depth 3.

## Repository map

`apps/server` (Nest gRPC), `apps/worker` (jobs), `apps/tui` (Ink), `apps/web` (React), `apps/admin`,
`packages/proto`, `packages/database`, `packages/domain`, `packages/config`, `packages/observability`,
`packages/media`, `packages/crypto`, `packages/testkit`, `infra/`, `docs/`.

Harness internals (hooks, agent roster, context-economy measurements) live in `docs/agents/` — read
them when editing the harness, not to do a task.
