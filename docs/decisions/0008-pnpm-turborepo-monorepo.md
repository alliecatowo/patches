# 0008. pnpm workspaces + Turborepo monorepo

**Status:** Accepted
**Date:** 2026-08-17

## Context

Patches spans multiple deployable apps (`server`, `worker`, `tui`, later `admin`, later
`mobile`) and multiple shared packages (`proto`, `config`, `domain`, `database`,
`observability`, `media`, `testkit`). These need to share TypeScript types (especially
generated protobuf code) and build/test/lint together in CI without duplicating
dependencies or hand-maintaining cross-package version pinning.

## Decision

Use **pnpm workspaces** for package management and **Turborepo** for task orchestration and
caching. Repository shape:

```text
patches/
├── apps/        (server, worker, tui, admin)
├── packages/    (proto, config, domain, database, observability, media, testkit)
├── infra/       (docker, fly, compose)
├── docs/        (architecture, decisions, operations, product)
├── .github/workflows/
├── mise.toml
├── pnpm-workspace.yaml
├── turbo.json
└── ...
```

Use **mise** as the tool version manager (Node, pnpm, Buf, and other deterministic
development CLIs pinned via committed `mise.toml`). Packages must represent legitimate
shared boundaries — no separate package created merely to hold one helper function.

## Consequences

- Generated protobuf types live in `packages/proto` and are consumed by both `apps/server`
  and `apps/tui` without duplication or drift.
- Turborepo's task caching keeps CI and local `build`/`test`/`lint` fast as the number of
  apps/packages grows.
- `mise.toml` gives every contributor (and CI) the exact same Node/pnpm/Buf versions,
  removing a whole class of "works on my machine" issues before they start.
- The workspace boundary discipline ("packages should represent legitimate shared
  boundaries") requires ongoing judgment calls in code review — it's easy to either
  over-fragment into tiny packages or let `apps/server` become a dumping ground instead of
  extracting a real shared package.
- Committing to pnpm's strict node_modules linking occasionally surfaces phantom-dependency
  bugs (using a package that isn't actually declared) — a net positive for correctness, but
  a real onboarding friction point for contributors used to npm/yarn's looser hoisting.

## Alternatives considered

- **Nx.** Rejected for now: no concrete blocker with the simpler Turborepo + pnpm
  combination has emerged, and Nx's plugin ecosystem/opinionation is more machinery than
  currently needed (`INITIAL_VISION.md` §8 — "do not use Nx unless a concrete blocker
  emerges").
- **npm or Yarn workspaces instead of pnpm.** Rejected: pnpm's content-addressable store and
  strict dependency linking are a better fit for a monorepo of this shape, and the spec
  mandates pnpm specifically.
- **Separate repositories per app/package (polyrepo).** Rejected: would fragment the shared
  protobuf contract and domain types across repo boundaries with versioned package
  publishing overhead, for no benefit at this team size.
