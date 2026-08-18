---
name: admin-cli-no-nest-pattern
description: apps/admin (patches-admin CLI) is deliberately plain TypeScript with no NestJS/gRPC, talking to Postgres directly via @patches/database's createDataSource
metadata:
  type: project
---

`apps/admin` (P6-003, `INITIAL_VISION.md` §65) was built as a **plain TypeScript CLI**, not
a Nest standalone app / `nest-commander` app like the spec's "suggested" text implies. It has
no `@nestjs/*` dependency at all: `main.ts` hand-parses `argv`, builds a `DataSource` via
`@patches/database`'s `createDataSource`, and calls command functions directly.

**Why:** the CLI's job is entirely CRUD-shaped mutations against Postgres plus one audit-log
insert per mutation — Nest's DI/module system buys nothing here and would double the file
count for zero behavior. It still follows the module-format convention (`apps/admin` is CJS
per `docs/agents/PACKAGE_CONVENTIONS.md`'s table, even though it declares no decorated
classes and doesn't strictly need `experimentalDecorators`).

**How to apply:** if extending `apps/admin` (new commands, etc.), keep following this
pattern — command functions take `(action: string, args: ParsedArgs, context: AdminContext)`
and are dispatched from `main.ts`'s `switch`. Don't introduce Nest just because the rest of
the monorepo uses it; `apps/worker` is the template for "Nest standalone app", `apps/admin`
is the template for "plain script that needs `@patches/database`".

Shared helpers this CLI needed that didn't already exist were added to
`packages/database/src/repositories/` (`appendAdminAuditLog`, `replayOutboxJob`) rather than
duplicated in `apps/admin` — that package is exactly the right layer for logic every
Postgres-talking app (server, worker, admin) might need, and it must never import gRPC/Nest
(§128–129), which plain functions over an `EntityManager` trivially satisfy.

See also [[concurrent-shared-checkout-hazard]] — this task ran interleaved with several other
agents' branches (federation, TUI pages, TUI media) all committing to the same
`codex/wip-tui-media` branch in the same working directory; `git status`/`git diff` showed
their in-progress untracked/modified files throughout, and `pnpm --filter @patches/server
typecheck` intermittently failed on files those agents were mid-editing (`pages.service.ts`,
then `federation/actor-document.service.ts`) — neither failure was caused by this task's
changes; confirmed by scoping typecheck/lint/test to only the touched packages/files and by
a full `pnpm build` succeeding across all 12 workspace packages.
