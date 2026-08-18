# Patches

Terminal-native social media.

Patches is a small, chronological, open-source social network whose first-class client is a
terminal app. No ranking algorithm, no infinite scroll, no ads — people, posts, images,
replies, and a feed sorted by time. Built as a TypeScript monorepo: a NestJS gRPC server,
an Ink (React) TUI, TypeORM + PostgreSQL, Protobuf/Buf, with ActivityPub federation and a
React Native client on the roadmap.

> **Status:** Phase 0 (foundation + risk spikes) — see [`docs/product/roadmap.md`](docs/product/roadmap.md).
> The TUI can connect to a local server and talk gRPC; posting/auth arrive in Phases 1–4.

```
┌ patches ─────────────────────────────────────────────────────────┐
│ Connected to patches-dev.                                        │
│                                                                  │
│ server        0.1.0 (protocol v1)                                │
│ features      system.ping                                        │
├──────────────────────────────────────────────────────────────────┤
│ connected · 127.0.0.1:50051        R reconnect  ? help  q quit   │
└──────────────────────────────────────────────────────────────────┘
```

## Development

Prerequisites: [mise](https://mise.jdx.dev/) and Docker (or Podman) for the local Postgres.

```bash
mise install                      # Node 24, pnpm 11, buf, actionlint (from mise.toml)
pnpm install
cp .env.example .env
mise run compose -- up -d         # postgres:17 + mailpit (docker compose, or podman compose fallback)
pnpm db:migrate                   # TypeORM migrations
pnpm build
```

Run it:

```bash
pnpm --filter @patches/server start          # gRPC server on 127.0.0.1:50051
pnpm --filter @patches/tui start --server 127.0.0.1:50051 --insecure   # full-screen TUI
node apps/tui/dist/cli.js ping --server 127.0.0.1:50051 --insecure        # non-interactive check (JSON, exit 0/1)
```

Watch mode: `pnpm --filter @patches/server dev` and `pnpm --filter @patches/tui dev`.

Everyday commands:

| Command                                                              | What it does                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm verify`                                                        | format check + lint + typecheck + unit tests (the pre-commit gate) |
| `pnpm test` / `pnpm test:integration`                                | Vitest projects; integration needs Postgres + `TEST_DATABASE_URL`  |
| `pnpm proto:gen` / `proto:lint` / `proto:breaking`                   | Buf generate (ts-proto) / lint / breaking-change check vs `main`   |
| `pnpm db:migrate` / `db:revert` / `db:show` / `db:generate --name=X` | TypeORM migrations (`packages/database`)                           |
| `pnpm --filter @patches/terminal-media spike`                        | Kitty graphics spike (run inside kitty/Ghostty)                    |
| `mise run compose -- <args>`                                         | compose wrapper for `infra/compose/docker-compose.yml`             |

More: [`docs/operations/local-development.md`](docs/operations/local-development.md),
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Repository layout

```
apps/server            NestJS 11 gRPC server (modular monolith)
apps/tui               Ink 7 / React 19 terminal client  (`patches`)
packages/proto         Protobuf schemas (patches.v1) + generated TypeScript (Buf + ts-proto)
packages/database      TypeORM 1.x DataSource, entities, migrations
packages/config        Validated environment schemas (zod)
packages/terminal-media  Terminal image rendering (Kitty graphics protocol + fallback)
packages/testkit       Test database helpers and factories
infra/                 compose stack (postgres, mailpit, optional minio), docker, fly (planned)
docs/                  product principles & roadmap, architecture, ADRs, operations, research
```

## Principles

Chronological first. The server gives you your social world; the client decides how to arrange it.
No engagement ranking, ever. Text and images are first-class. Identity is expressive. Open
architecture: the TUI is one client of a versioned protobuf API. Read
[`docs/product/principles.md`](docs/product/principles.md) and the full spec in
[`INITIAL_VISION.md`](INITIAL_VISION.md).

## Contributing & agents

This repo is developed with an AI agent harness (`CLAUDE.md`, `.claude/`, `docs/agents/`) that
records learnings and improves itself as the project grows. Humans and agents follow the same
rules: [`CONTRIBUTING.md`](CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md),
[`SECURITY.md`](SECURITY.md). Task board: [`tasks.md`](tasks.md).

## License

[MIT](LICENSE) © 2026 Allison Coleman
