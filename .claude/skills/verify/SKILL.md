---
name: verify
description: Canonical check sequence (format, lint, typecheck, test, proto checks, migration check) with a scoped variant, and how to interpret/fix common failures. Use for /verify [package]. Must be run before every commit.
invocation: user
allowedTools: Bash, Read, Grep
---

# /verify $ARGUMENTS

If `$ARGUMENTS` is empty, run the full repo sequence. If it's a package name (e.g. `@patches/server`, `server`, `database`), scope every step with `pnpm --filter <workspace>` where the script supports it.

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

`pnpm verify` = `format:check && lint && typecheck && test` in one shot — use it as the fast default; run the proto/db steps separately when relevant.

## Scoped variant

```
pnpm --filter @patches/<name> typecheck
pnpm --filter @patches/<name> test
pnpm format:check -- <paths>   # prettier --check accepts path args
pnpm lint -- <paths>           # eslint accepts path args
```

Full-repo `lint`/`format:check` are cheap enough to just run unscoped unless you specifically need speed.

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
