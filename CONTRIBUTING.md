# Contributing to Patches

Thanks for taking an interest in Patches. This is a terminal-native social
network built on a chronological, no-engagement-ranking, no-algorithm
philosophy — see [`INITIAL_VISION.md`](INITIAL_VISION.md) for the full
product and architecture spec. If you're about to make a change that touches
product behavior or system design, read that first. It's long, but it's the
source of truth, and we'd rather you disagree with it loudly in an issue than
quietly work around it in a PR.

This document covers the mechanics: how to get the repo running, how to
structure a change, and what CI expects from you.

## Getting set up

The short version:

```bash
mise install
pnpm install
podman compose up -d   # or: docker compose up -d
pnpm db:migrate
pnpm dev
```

See the [README](README.md) for the exact, currently-correct commands —
scripts and service names may drift as the monorepo grows, and the README is
what we keep in sync. If the README and this file ever disagree, trust the
README and file an issue against this one.

You'll need `mise` installed to pick up the pinned Node/pnpm toolchain, and a
container runtime (Podman or Docker) for local Postgres and Mailpit.

## Branch naming

Name branches by the kind of change they make:

```text
feat/<short-description>
fix/<short-description>
docs/<short-description>
chore/<short-description>
```

Examples: `feat/thread-reply-pagination`, `fix/media-upload-mime-sniff`,
`docs/moderation-appeals`, `chore/bump-buf`.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<optional scope>): <short summary>

<optional body>
```

Common types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`,
`ci`. Keep the summary line under ~72 characters and in the imperative mood
("add", not "added").

## Making a pull request

Keep PRs small and reviewable. A PR that does one thing is easier to review,
easier to revert, and easier to reason about six months from now than a PR
that does five things well.

Before you open a PR, make sure it has:

- **Tests** for new behavior or fixed bugs (unit, and integration where the
  change crosses a repository/gRPC boundary).
- **Docs** updated if you changed behavior, an RPC, a schema, or a workflow
  — see [Where docs live](#where-docs-live) below.
- **An ADR** if the change is architecturally consequential (new
  dependency, new module boundary, a deviation from `INITIAL_VISION.md`).
  See `docs/decisions/` for the format and existing examples.

Fill out the PR template. It isn't busywork — the checklist (tests, docs,
ADR, proto breaking-change check, migration review, project board status, no
secrets) exists because these are the things that are easy to forget under
deadline pressure and expensive to discover in production.

## CI checks

Every PR runs the same checks CI will hold you to. Run them locally before
you push so review cycles aren't spent on formatting nits:

```text
format
lint
typecheck
buf lint
buf breaking
build
unit tests
integration tests
migration validation
```

All of them need to be green before merge. If `buf breaking` fails, don't
work around it — see the protobuf section below.

## Changing the protobuf API

Protobuf is the canonical client/server API contract, defined under
`packages/proto/proto/patches/v1/`. A few hard rules:

- Run `buf format`, `buf lint`, and `buf generate` after any schema change.
- **Never reuse a field number that used to mean something else.** If you
  remove a field, `reserve` its number and name instead of letting a future
  field silently take it over.
- Additive, backward-compatible changes are fine on the existing API
  version. A genuinely breaking change needs a new API version, not a
  force-through of `buf breaking`.
- Regenerate and commit the generated TypeScript output alongside the
  schema change — don't leave generated code stale relative to `.proto`
  files.

## Adding a database migration

- Migrations live alongside the relevant TypeORM setup; never rely on
  `synchronize: true` outside disposable local/test scratch environments.
- Generate a migration, then **read it**. Generated migrations are a
  starting point, not a guarantee — TypeORM doesn't always produce the
  Postgres-specific index or constraint you actually want, and those may
  need to be written by hand.
- Migrations should be reversible where practical, and safe to run against
  a live database ahead of a deploy (no long table locks without a plan).
- CI validates migrations; make sure `pnpm db:migrate` succeeds cleanly
  against a fresh database before opening the PR.

## Where docs live

```text
docs/architecture/   system design: overview, data model, API, media, jobs, federation
docs/operations/     deployment, database, backups, incident response
docs/product/        principles, roadmap, moderation, privacy
docs/decisions/      ADRs — numbered, short, one decision each
```

If your change affects how the system is built or how it behaves for users,
update the relevant doc in the same PR. Docs that lag the code are worse
than no docs.

## Code style

- **No `any`.** If the type is genuinely unknown, model it honestly
  (`unknown` + narrowing, a proper union, a generic) rather than opting out
  of the type system.
- **No `@ts-ignore`.** If the compiler is wrong, that's rare enough to be
  worth a real investigation, not a suppression.
- **No `eslint-disable` without a comment** explaining why the rule doesn't
  apply here. A bare disable is a landmine for the next person.
- **No `utils.ts` / `helpers.ts` / `common.ts` / `misc.ts` dumping
  grounds.** Give shared code a name that describes what it actually does
  and a module boundary that means something. If you can't name it, that's
  usually a sign it should live closer to its one caller instead.
- Keep dependency direction boring: domain/application code doesn't know
  about Ink, database packages don't know about gRPC, the TUI doesn't
  import TypeORM entities, and the protobuf package doesn't import server
  implementation code. See `INITIAL_VISION.md` §129 if you're unsure which
  way a dependency should point.

## Agent-assisted contributions

This repository includes a Claude Code harness under `.claude/`. If you're
contributing with the help of an agent (or you _are_ the agent), it must
follow the project's `CLAUDE.md` and keep the
[GitHub Project board](https://github.com/users/alliecatowo/projects/5) up to
date as work progresses — move `Status`, file discovered follow-ups as new
draft items, promote a draft to a real issue once work is about to start on
it — since that board is how humans track what an agent session actually
did, and it needs to reflect reality, not just intent. `tasks.md` is
the historical archive and the offline fallback, not where agents check work
off. Agent-authored PRs are held to the exact same bar as human ones: small,
tested, documented, and honest about tradeoffs, and should reference the
issue they close (`Fixes #<n>`) so Status moves automatically.

## Questions

If something here is unclear, or you're not sure whether a change needs an
ADR, open an issue (or a Discussion, if enabled) rather than guessing. We'd
rather answer a question than review a PR built on a wrong assumption.
