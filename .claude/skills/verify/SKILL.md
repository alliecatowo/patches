---
name: verify
description: Canonical scoped verification with explicit full-gate, proto, and migration variants. Use for /verify <package> or /verify full; run the relevant scoped check before committing.
invocation: user
allowedTools: Bash, Read, Grep
---

# /verify $ARGUMENTS

If `$ARGUMENTS` is a package name (e.g. `@patches/server`, `server`, `database`), run its scoped
check. If it is `full`, run the full sequence. With no argument, inspect the changed paths and run
the scoped check for each touched workspace; ask for a scope when no changed workspace is clear.
Never silently choose a full gate — CI owns it except for an explicitly requested milestone check.

## Full sequence

```
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm proto:lint       # only meaningful if packages/proto changed, but cheap enough to always run
pnpm proto:breaking   # only if packages/proto changed
pnpm db:show          # only if a Postgres instance is reachable (see below) and packages/database changed
```

`mise run verify` runs the full gate through the resource throttle; use it only when `full` was
requested. `pnpm test` is `turbo run test`: per-package unit tests, cached — an unchanged package
replays instead of re-running. Integration suites are NOT part of it (they're DB-dependent and
uncacheable); run them via `mise run test` or `pnpm test:integration` when required.

## Scoped variant — use this while working

```
mise run check <name>        # tui | web | server | database | … (or the full @patches/<name>)
```

One command: typecheck + tests + prettier for that workspace, run under the **pinned** Node,
turbo-cached (typecheck+test replay instantly when nothing changed). Use it instead of
hand-rolling `pnpm --filter X typecheck && … && …` chains,
and instead of wrapping anything in `zsh -i -c` or `mise exec --` — those only ever existed to
work around a stale `node` on `PATH`, and `mise run` already resolves the pinned toolchain.

If you need the pieces separately:

```
pnpm --filter @patches/<name> typecheck
pnpm --filter @patches/<name> test --reporter=dot
pnpm exec prettier --check <dir>
```

Full-repo `lint`/`format:check` are cheap enough to run unscoped unless you specifically need
speed. Note `pnpm lint` runs a full type-aware ESLint pass over the repo (~40s) and does not
accept `-f unix` — that formatter was removed from core ESLint and fails _after_ the whole run.

## Postgres reachability for db:show

`pnpm db:show` needs a live DB. Check with `mise run compose -- ps` or attempt the command and treat a connection error as "skipped, DB not up" rather than a failure — don't start Postgres yourself unless asked (state changes to shared infra should be explicit).

## Interpreting common failures

- **format:check fails** — run `pnpm format` to fix, then re-check (don't hand-edit whitespace).
- **lint fails** — read the rule name in the output; `pnpm lint:fix` handles auto-fixable ones. A `no-explicit-any`/`no-unused-vars` failure is almost never something to suppress (spec §153–154 bans `eslint-disable` without a one-line justification) — fix the actual code.
- **typecheck fails** — usually a real type error; `apps/server`/`apps/worker`/`apps/admin` are CJS+NodeNext, `apps/tui`/`packages/*` are ESM — a module-format mismatch shows up here as a resolution error, not a type error, so check `docs/agents/PACKAGE_CONVENTIONS.md` if the error looks like a missing-module error instead of a type mismatch.
- **test fails** — read the assertion, not just the red line. Integration tests need `TEST_DATABASE_URL` (see `.env.example`) — a connection-refused failure there means Postgres isn't up (`mise run compose -- up -d`), not a code bug.
- **proto:breaking fails** — you reused or removed a field number, or changed a field type incompatibly. Never reuse a removed field number — reserve it instead (see `/proto-change`).
- **db:show shows pending migrations** — you edited an entity without generating a migration; run `/migration <Name>`.

Never skip a failing step to get to a commit — fix it or report it as a blocker.

## TUI checks from a non-TTY shell

Drive the full-screen app in tmux and capture frames (`tmux new-session -d -s v -x 100 -y 28 "node apps/tui/dist/cli.js …"`, `tmux send-keys -t v q`, `tmux capture-pane -t v -p`); use `node apps/tui/dist/cli.js ping …` for a scripted exit-code check. Details: `docs/agents/LEARNINGS.md` → "Verifying a TTY app from a non-TTY agent shell".
