# Patches

Terminal-native social media.

Patches is a small, chronological, open-source social network whose first-class client is a
terminal app. No ranking algorithm, no infinite scroll, no ads — people, posts, images,
replies, reposts and quotes, tags, communities, direct messages, and a feed sorted by time,
always. Built as a TypeScript monorepo: a NestJS gRPC server, an Ink (React) TUI, a responsive web
client (with themes, profile wall editing, followers/following, and PWA support), TypeORM +
PostgreSQL, Protobuf/Buf, with two-node ActivityPub federation running in a local lab and mobile
web / PWA providing the mobile experience (React Native paused).

> **Status:** the single-node social product (Phases 0–8) plus Amendment B social depth
> (reposts/quotes, tags, communities, DMs, flair, edit history) and Amendment C privacy/
> filters/decentralized moderation are implemented; the flagship node
> **patches-social.fly.dev** is live — see [`docs/product/roadmap.md`](docs/product/roadmap.md).

![Patches TUI: home feed, thread, reply, and notifications, recorded against the live node](docs/media/hero.gif)

## Try the live node

The flagship node, `patches-social.fly.dev`, is running the real network — the client
connects there by default. It's invite-only right now; ask Allie for an invite code.

Two hosted surfaces sit in front of the flagship node: [patches-web.pages.dev](https://patches-web.pages.dev)
is the responsive browser GUI (`apps/web`), talking to `patches-social.fly.dev` over Connect; and
[patches-site.pages.dev](https://patches-site.pages.dev) is the docs/marketing site (`site/`,
VitePress) — see [`docs/operations/web.md`](docs/operations/web.md) and
[`docs/operations/site.md`](docs/operations/site.md) for hosting/deploy detail.

The hosted web build is currently stale (`0.1.0+29df763`). The repository contains locally
verified fixes for its BigInt-backed actor-session serialization, closed-node profile errors,
and build identity, but those fixes are not live until B-063's gated deployment completes.

<p>
  <img src="docs/media/home.png" alt="Home feed" width="32%" />
  <img src="docs/media/thread.png" alt="Thread view" width="32%" />
  <img src="docs/media/profile.png" alt="Profile view" width="32%" />
</p>

```bash
git clone <repo-url> patches && cd patches
mise install                              # Node 24, pnpm 11, buf (from mise.toml)
pnpm install
pnpm --filter @patches/tui build

node apps/tui/dist/cli.js register \
  --handle you --display-name "You" --email you@example.com --invite <code>

node apps/tui/dist/cli.js            # opens the full-screen TUI, connected by default
node apps/tui/dist/cli.js --help     # every subcommand (login, whoami, keys, verify, ...)
```

No `--server`/`--insecure` needed — the client's default target is
`patches-social.fly.dev:443` over TLS. A published `npm install -g patches-social` is planned
but not live yet (publishing itself is a manual owner step, see
`docs/operations/deployment.md`); building from a source checkout, as above, is the
supported path today. Production R2 media storage and Resend email are configured; current
live caveats, including the stale hosted web revision, are tracked in
[`docs/user-guide.md`](docs/user-guide.md#live-node-status-and-caveats).

## Using Patches

For end users: installing the `patches` terminal client, connecting to a node,
registering/signing in, and the in-app keybindings, see
[`docs/user-guide.md`](docs/user-guide.md).

## Development

Prerequisites: [mise](https://mise.jdx.dev/) and Docker (or Podman) for the local Postgres.

```bash
mise install        # Node 24, pnpm 11, buf, actionlint (from mise.toml)
mise run setup      # install · private .env + generated keys · compose · migrations · build
```

Run it (two terminals):

```bash
mise run server     # gRPC server on 127.0.0.1:50051
mise run tui:prod   # the TUI against the live node (same as plain `patches`) — see docs/operations/try-it.md
mise run ping:prod  # connectivity check against the live node
mise run tui        # full-screen TUI  (q quit · R reconnect · ? help)
mise run ping       # non-interactive check (JSON, exit 0/1)
```

The same without mise tasks:

```bash
pnpm install && cp .env.example .env && pnpm keys:generate >> .env
mise run compose -- up -d           # docker compose, or podman compose fallback
pnpm db:migrate && pnpm build
pnpm --filter @patches/server start
pnpm --filter @patches/tui start --server 127.0.0.1:50051 --insecure
```

Watch mode: `mise run server:dev` (or `pnpm --filter @patches/server dev`) and `pnpm --filter @patches/tui dev`.
Kitty/Ghostty image spike: `mise run spike`. All tasks: `mise tasks ls`.

Everyday commands:

| Command                                                              | What it does                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm verify`                                                        | format check + lint + typecheck + unit tests (the pre-commit gate) |
| `pnpm test` / `pnpm test:integration`                                | Vitest projects; integration needs Postgres + `TEST_DATABASE_URL`  |
| `pnpm proto:gen` / `proto:lint` / `proto:breaking`                   | Buf generate (ts-proto) / lint / breaking-change check vs `main`   |
| `pnpm db:migrate` / `db:revert` / `db:show` / `db:generate --name=X` | TypeORM migrations (`packages/database`)                           |
| `pnpm --filter @patches/terminal-media spike`                        | Kitty graphics spike (run inside kitty/Ghostty)                    |
| `mise run compose -- <args>`                                         | compose wrapper for `infra/compose/docker-compose.yml`             |
| `mise run docker:build`                                              | Build the production image (`infra/docker/Dockerfile`)             |

More: [`docs/operations/local-development.md`](docs/operations/local-development.md),
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Repository layout

```
apps/server            NestJS 11 gRPC server (modular monolith)
apps/worker            NestJS standalone background-job worker (media, exports, federation delivery, ...)
apps/tui               Ink 7 / React 19 terminal client  (`patches`)
apps/web               Responsive browser GUI (Vite + React 19), Connect transport, no separate backend
apps/admin             Moderation/admin CLI (`patches-admin`) — reads/writes Postgres directly
packages/proto         Protobuf schemas (patches.v1) + generated TypeScript (Buf + ts-proto, protobuf-es)
packages/database      TypeORM 1.x DataSource, entities, migrations
packages/domain        Shared domain types, error codes, and limits (@patches/domain)
packages/config        Validated environment schemas (zod)
packages/client        Transport-agnostic client SDK shared by web/RN (@patches/client)
packages/crypto        Shared cryptographic primitives (e.g. federation key encryption)
packages/media         Media processing (Sharp derivatives) shared by server/worker
packages/markup        Safe Markdown-subset rendering for Pages/community rules
packages/terminal-media  Terminal image rendering (Kitty graphics protocol + fallback)
packages/testkit       Test database helpers and factories
infra/                 compose stack (postgres, mailpit, optional minio); infra/docker (Dockerfile); infra/fly (fly.toml, live deploy)
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
