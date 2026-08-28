# Agent harness contract

## Resource-bounded verification (#302)

Up to ~8 agent worktrees can run `mise run check`/`verify`/`build` and vitest/tsc concurrently on
one box, which has crashed both the workstation and the Claude Code process. Every heavy task
routes through `scripts/bounded.sh <command> [args...]` — `mise run check`, `mise run verify`,
`mise run test`, and the lefthook pre-commit/pre-push hooks all use it already. Workers never need
to think about contention:

- **Use `mise run check <workspace>` for scoped work; never run the full `mise run verify`/`pnpm
verify` locally.** CI (`.github/workflows/ci.yml`) is still the full, unscoped gate — that's
  what `verify` is for; a worktree doing scoped implementation work should not replay it.
- **Never background a check to dodge contention** (`&`, `nohup`, a detached shell) — the
  throttle already queues bounded work safely; backgrounding just adds an unbounded process
  outside the slot system.
- `scripts/bounded.sh` acquires one of `PATCHES_CHECK_SLOTS` flock-based slots (default
  `max(2, nproc/4)`, so 4 on a 16-core box), runs the command `nice -n 10 ionice -c2 -n7`, and —
  when `systemd-run --user` is available — inside a cgroup scope with `MemoryMax`
  (`PATCHES_CHECK_MEM`, default `3G`) and `CPUWeight=50`. If every slot is busy it waits on the
  last slot (bounded by `PATCHES_CHECK_WAIT_TIMEOUT`, default 600s) and logs that it's waiting,
  rather than queuing unboundedly or silently hanging.
- `VITEST_MAX_WORKERS` (default 2) and `NODE_OPTIONS=--max-old-space-size=2048` are exported by
  the wrapper and honored by every `vitest.config.*`'s `maxWorkers`; override either per-invocation
  if a task genuinely needs more headroom.
- Tiers get heavier moving up: pre-commit is staged-file prettier/eslint plus `tsc --noEmit` for
  only the touched workspace(s) (`scripts/precommit-typecheck.sh`); `mise run check <ws>` is that
  workspace only, incremental (`tsconfig.base.json`'s `${configDir}` `tsBuildInfoFile`) and
  turbo-cached; pre-push is `--affected` workspaces vs `origin/main`; PR CI stays the full gate.
  See `docs/operations/local-development.md` "Git hooks" and `docs/operations/ci.md`.

## Direct action surface

`mise run lab:action -- <verb> ...` drives the isolated lab through `@patches/client/grpc` and
`createPatchesApi`, never through a TUI shell. The currently supported verbs are `register`,
`login`, `logout`, `post`, `delete-post`, `follow`, `unfollow`, `notifications`, and
`wait-unread`. Authenticated actions take `--handle --password-stdin`; plaintext passwords are
never accepted in argv, and tokens are process-local and never written or printed. Every action
revokes the sessions it creates before returning. Each action generates, sends, and returns its exact
`x-request-id` (`requestIds` for multi-RPC notification/world actions); mutation results also
return their deterministic `clientRequestId` where applicable.

`mise run lab:world:ensure -- --file world.json` accepts credential-free, stable-key
`{ users, follows?, posts? }` JSON. Credentials are derived from a protected, non-emitted lab seed.
An identical declaration can be run twice; changes and removals fail closed because this slice does
not yet implement authoritative inverse cleanup. It intentionally does not manage communities,
DMs, Mailpit, or log inspection; notification actions exclude DM notifications and bounded waits
observe unread counts only.

For recovery testing only, `world-ensure --fail-after N` fails immediately after atomically
journaling mutation `N`; rerun the identical declaration without the flag to prove resume. The
journal is written before the first RPC and after every successful mutation, so a partial failure
cannot be bypassed with a different declaration.

World JSON is a strict recursive schema: every resource has a stable `key`, unknown fields and
secret-bearing property names are rejected. The seed and ownership journal are current-user,
regular, no-follow files with exact `0600` permissions; malformed, symlinked, weak, or permissive
state is refused rather than repaired implicitly.

`mise run lab:logs -- --request-id <exact> --limit 200` emits bounded JSON lines containing only
allowlisted operational fields after string scrubbing. Non-JSON lines and arbitrary nested values
are omitted. Each file is read backward with a hard 256 KiB/1,000-line pre-parse cap and an
explicit `logs.truncated` record; request IDs must be canonical UUIDs and trace IDs exact 32-digit
hex. Raw following is disabled until a streaming implementation can enforce the same boundary.

This repository supports Codex, Claude, and other clients through the same contract:

- The root/main agent orchestrates and gates acceptance. It delegates safely separable
  product/harness implementation instead of competing with workers for the same files.
- A worker owns only the paths in its brief. Parallel briefs have disjoint write sets and state
  that the checkout may be shared; no agent reverts unrelated edits.
- State moves as short packets: done, left, owned paths, verification, and next concrete step.
  Do not keep an implementation worker alive only to preserve context.
- Review is independent and stronger than implementation; verification is a separate evidence
  step when the blast radius warrants it. Neither review nor verification silently changes code.
- Work originates in an explicit user request, the [GitHub Project board](https://github.com/users/alliecatowo/projects/5), or the authoritative spec. Agents may
  report a discovered follow-up, but do not create work by guessing.
- The hard rules in `AGENTS.md`/`CLAUDE.md` and `INITIAL_VISION.md` apply to every client and
  delegation level. A harness improvement cannot weaken them; a genuine conflict needs the ADR
  process and human sign-off.

Model selection and client-specific examples live in [MODEL_ROUTING.md](MODEL_ROUTING.md).

## Headless browser MCP

The project-scoped Playwright MCP entry in `.codex/config.toml` starts an isolated,
headless Playwright browser through the pinned `@playwright/mcp` package. It is independent
of the laptop display and remains usable with the screen off. It is also separate from the
Codex in-app Browser and does not attach to a user's Chrome profile or existing signed-in tabs.

After changing the MCP entry, restart or reload Codex, then reopen the project/session if the
new `playwright` tools are not discovered. Confirm the handshake by asking Codex to navigate the
isolated browser to a harmless URL and return an accessibility snapshot. The first start may
download Playwright's browser into its cache.

The server uses `--isolated`, so cookies and local storage are discarded when the browser closes;
do not add a storage-state file, browser extension, CDP endpoint, or unrestricted file access to
this project default. Its bounded diagnostic output is ignored at `.codex/playwright-output/`.

To upgrade deliberately, check the [official Playwright MCP release metadata](https://github.com/microsoft/playwright-mcp/blob/main/server.json), replace the exact version in `.codex/config.toml`, restart Codex, verify the handshake, and run the relevant harness/browser checks. Do not substitute an unpinned `latest` version.
