# Patches

**Terminal-native social media.** Chronological, open-source, no ranking algorithm, no
infinite-scroll tricks, no ads, no votes or karma. A feed sorted by time, always — the server
gives you your social world, the client decides how to arrange it.

![Patches TUI: home feed, thread, reply, and notifications, recorded against the live node](docs/media/hero.gif)

People, posts, and image attachments; replies, reposts, and quotes; tags and communities;
flair and pinned posts; a personal terminal "Page" for every actor; and a small, real
federation lab. The first-class client is a terminal app built with Ink/React; a responsive
web client is a full peer, not an afterthought.

> **Status:** the single-node social product (spec Phases 0–8) plus social depth
> (reposts/quotes, tags, communities, flair, edit history — Amendment B) and privacy/filters/
> decentralized moderation (Amendment C) are implemented, and the flagship node
> **patches-social.fly.dev** is live. Direct messages are the one big exception — see
> [Honest status](#honest-status) below before you go looking for them. Full detail:
> [`docs/product/roadmap.md`](docs/product/roadmap.md).

<p>
  <img src="docs/media/home.png" alt="Home feed" width="32%" />
  <img src="docs/media/thread.png" alt="Thread view" width="32%" />
  <img src="docs/media/profile.png" alt="Profile view" width="32%" />
</p>

## Honest status

This project runs on an "only document what actually works" rule, so here's the unvarnished
version:

- **Working on the live node today:** register/login (password or SSH key), post, reply,
  like, bookmark, repost/quote, follow, home/local feeds, tags, communities, notifications,
  image attachments (Kitty graphics protocol with a plain-text fallback elsewhere), flair,
  pinned posts, profile Pages with a guestbook, and blocking/muting/reporting.
- **Direct messages do not work yet.** The DM protocol — per-device identity, session setup,
  and message fanout — is implemented and covered by integration tests, but the step where
  two real accounts establish a session with each other is still blocked by an open bug
  (device-identity encoding mismatch, tracked as B-124 in [`tasks.md`](tasks.md)). No client,
  live or local, can currently send a working DM. When this ships, expect it to be described
  plainly and specifically, not as a generic "secure messaging" claim — see
  [`docs/architecture/e2ee.md`](docs/architecture/e2ee.md) for the real state of the protocol
  and what's still gated.
- **The hosted web build** at [patches-web.pages.dev](https://patches-web.pages.dev) deploys
  from `main` on a gate, not on every commit — if something there looks off, its footer prints
  the exact commit it's running (`patches web <version>+<short-sha>`); compare that against
  `git log` on `main` rather than trusting a claim frozen in this README.
- **Federation** runs today only as a local two-node lab (`mise run fed:lab`); the flagship
  node does not federate with the outside world yet.
- **The live node is invite-only.** Ask Allie for a code, or run the whole stack locally
  (below) and invite yourself.

For everything else, [`docs/product/roadmap.md`](docs/product/roadmap.md) tracks what's
implemented, in progress, or planned, phase by phase.

## Try the live node

Two hosted surfaces sit in front of the flagship node: [patches-web.pages.dev](https://patches-web.pages.dev)
is the responsive browser GUI (`apps/web`), talking to `patches-social.fly.dev` over Connect;
and [patches-site.pages.dev](https://patches-site.pages.dev) is the docs/marketing site
(`site/`, VitePress).

Or install the terminal client. Check
[github.com/alliecatowo/patches/releases](https://github.com/alliecatowo/patches/releases) for
the newest release tag and asset name, then:

```bash
npm install --global --allow-remote=all https://github.com/alliecatowo/patches/releases/download/<tag>/<asset>.tgz
# e.g. .../download/v0.1.0-alpha.3/patches-social-0.1.0-alpha.3.tgz
# npm 12 blocks remote tarballs by default: keep --allow-remote=all, or download the .tgz and install the local file

patches register --handle you --display-name "You" --email you@example.com --invite <code>
patches                 # opens the full-screen TUI, connected to patches-social.fly.dev by default
patches --help           # every subcommand (login, whoami, keys, verify, ...)
```

A `curl | sh` installer, an npm registry package, and Homebrew are planned (`tasks.md` B-138)
but not live yet — the release-tarball install above is the only supported path today. Full
walkthrough, including how to drive two accounts side by side to see follow/reply/notify in
action: [`docs/operations/try-it.md`](docs/operations/try-it.md).

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
mise run tui        # full-screen TUI against it  (q quit · R reconnect · ? help)
mise run ping       # non-interactive connectivity check (JSON, exit 0/1)
```

Against the live node instead of your local stack: `mise run tui:prod` /
`mise run ping:prod` — see [`docs/operations/try-it.md`](docs/operations/try-it.md).

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

| Command                                                              | What it does                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `mise run check <workspace>`                                         | typecheck + tests + lint + format for one package (`tui`/`web`/`server`/...) |
| `pnpm verify`                                                        | format check + lint + typecheck + unit tests (the pre-commit gate)           |
| `pnpm test` / `pnpm test:integration`                                | Vitest projects; integration needs Postgres + `TEST_DATABASE_URL`            |
| `pnpm proto:gen` / `proto:lint` / `proto:breaking`                   | Buf generate (ts-proto) / lint / breaking-change check vs `main`             |
| `pnpm db:migrate` / `db:revert` / `db:show` / `db:generate --name=X` | TypeORM migrations (`packages/database`)                                     |
| `pnpm --filter @patches/terminal-media spike`                        | Kitty graphics spike (run inside kitty/Ghostty)                              |
| `mise run compose -- <args>`                                         | compose wrapper for `infra/compose/docker-compose.yml`                       |
| `mise run docker:build`                                              | Build the production image (`infra/docker/Dockerfile`)                       |

More: [`docs/operations/local-development.md`](docs/operations/local-development.md),
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Repository layout

```
apps/server            NestJS 11 gRPC server (modular monolith)
apps/worker             NestJS standalone background-job worker (media, exports, federation delivery, ...)
apps/tui                Ink 7 / React 19 terminal client  (`patches`)
apps/web                Responsive browser GUI (Vite + React 19), Connect transport, no separate backend
apps/admin              Moderation/admin CLI (`patches-admin`) — reads/writes Postgres directly
packages/proto          Protobuf schemas (patches.v1) + generated TypeScript (Buf + ts-proto, protobuf-es)
packages/database       TypeORM 1.x DataSource, entities, migrations
packages/domain         Shared domain types, error codes, and limits (@patches/domain)
packages/config         Validated environment schemas (zod)
packages/client         Transport-agnostic client SDK shared by web/RN (@patches/client)
packages/crypto         Shared cryptographic primitives (E2EE identity/ratchet, federation key encryption)
packages/media          Media processing (Sharp derivatives) shared by server/worker
packages/markup         Safe Markdown-subset rendering for Pages/community rules
packages/terminal-media  Terminal image rendering (Kitty graphics protocol + fallback)
packages/testkit        Test database helpers and factories
infra/                  compose stack (postgres, mailpit, optional minio); infra/docker (Dockerfile); infra/fly (fly.toml, live deploy)
docs/                    product principles & roadmap, architecture, ADRs, operations, research
```

## Principles

Chronological first. The server gives you your social world; the client decides how to
arrange it. No engagement ranking, ever — there is no `rankHomeFeed()` in this codebase and
there never will be. No votes, karma, or scores. Text and images are first-class. Identity is
expressive. Open architecture: the TUI is one client of a versioned protobuf API. Read
[`docs/product/principles.md`](docs/product/principles.md) and the full spec in
[`INITIAL_VISION.md`](INITIAL_VISION.md) for the rest.

## Contributing & agents

This repo is developed with an AI agent harness (`CLAUDE.md`, `.claude/`, `docs/agents/`) that
records learnings and improves itself as the project grows. Humans and agents follow the same
rules: [`CONTRIBUTING.md`](CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md),
[`SECURITY.md`](SECURITY.md). Task board: [`tasks.md`](tasks.md).

## License

[MIT](LICENSE) © 2026 Allison Coleman
