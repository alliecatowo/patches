# Patches — agent operating manual

Patches is a terminal-native, chronological, open-source social network.
TypeScript monorepo: NestJS 11 gRPC server + worker, Ink 7 TUI, TypeORM 1.x + PostgreSQL,
Protobuf/Buf, Cloudflare R2, Fly.io. Future: ActivityPub, React Native.

`INITIAL_VISION.md` is the **authoritative spec**. When in doubt, grep it (`grep -n "^# " INITIAL_VISION.md`
lists sections). Do not reinterpret architectural decisions; write an ADR in `docs/decisions/` if you must deviate.

## Toolchain (non-negotiable)

- Tool versions come from `mise.toml` (`mise install`). Node 24 LTS, pnpm 11, buf, TypeScript **5.9** (not 7 — see ADR 0009).
- **pnpm only.** Never `npm install`/`yarn`. Add deps with the CLI (`pnpm add <pkg> --filter <workspace>` or `pnpm add -w -D <pkg>`), never by hand-editing `package.json` versions.
- Containers: this machine has **podman**, not docker. Use `mise run compose -- <args>` (wraps `docker compose`/`podman compose`), e.g. `mise run compose -- up -d`.
- Task runner: `pnpm turbo` via root scripts (`pnpm build|lint|typecheck|test|dev`). See `package.json`.
- Protobuf: `pnpm proto:gen` (buf generate), `pnpm proto:lint`, `pnpm proto:breaking`.
- DB: `pnpm db:migrate`, `pnpm db:generate --name=<Name>` (TypeORM migrations, reviewed by a human/agent before commit).

## Hard rules (from the spec, §153)

No Prisma/Drizzle/GraphQL/tRPC/Firebase/Supabase-as-backend/Redis/Kafka/Kubernetes in v0. No offset timeline
pagination. No engagement ranking (never a `rankHomeFeed()`). No `synchronize: true`. No TypeORM entities returned
over gRPC. No plaintext passwords/refresh tokens. No image uploads proxied through Node. Never reuse a removed
protobuf field number. Federation is a seam (`FederationGateway` → `Noop`) only. TUI must always have a
non-Kitty fallback. No `any`, `@ts-ignore`, `eslint-disable`, or empty `catch {}` without a one-line justification comment.

## Layering

protobuf request → controller (transport adapter) → application service → repository/TypeORM.
Domain code never imports Ink; database package never imports gRPC; TUI never imports TypeORM; proto package
never imports server code.

## Working agreement

1. Work happens on feature branches; commit atomically with Conventional Commits (`feat(server): …`, `docs: …`).
2. `tasks.md` is the live task board. Pick tasks from it, check them off, file new ones you discover.
   Use `/task` to add/complete tasks consistently.
3. Before touching a technology, read its note in `docs/research/` (verified against official docs). If the note
   is missing or wrong, fix the note — that is part of the job.
4. Every change must leave the repo runnable: `pnpm verify` (format + lint + typecheck + test) must pass. Use `/verify`.
5. When you learn something non-obvious (a gotcha, a wrong assumption, a better pattern), append it to
   `docs/agents/LEARNINGS.md` via `/retro`, and if it changes how agents should behave, edit this file, the
   relevant `.claude/rules/*.md`, or the agent definitions in `.claude/agents/`. **The harness is meant to be
   tweaked; improving it is in-scope work, not a distraction.**
6. Update docs in the same change as the code (`docs/architecture/*`, `docs/operations/*`, README).
7. Never document a command that doesn't work. Run it first.

## Delegation (see `docs/agents/MODEL_ROUTING.md`)

The main session orchestrates; subagents in `.claude/agents/` do the work. Default to **sonnet** for
implementation, **haiku** for mechanical checks/verification/docs polishing, **opus** for review, tricky
debugging, and architecture, **fable** only for the hardest problems or deep architectural audits.
Fan out independent work in parallel; give each agent a disjoint file set; require them to run `pnpm verify`
on what they touched. Nested agents are allowed (depth 3): implementers may spawn a researcher or a verifier.

## Repository map

`apps/server` (Nest gRPC), `apps/worker` (Nest standalone jobs), `apps/tui` (Ink), `apps/admin` (admin CLI),
`packages/proto` (schemas + generated TS), `packages/database` (TypeORM entities/migrations/DataSource),
`packages/domain` (shared domain types/errors/limits), `packages/config` (env schema),
`packages/observability`, `packages/media`, `packages/testkit`, `infra/` (compose, docker, fly), `docs/`.

@docs/agents/HARNESS.md
