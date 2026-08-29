# Agent harness contract

## Package boundaries

Four packages divide harness-adjacent work; none of the others do its job:

- **`@patches/testkit`** = network-free **rows**. `withTransactionRollback` + fixture factories
  (`createTestUser`, `mintInvite`, `createTestPasswordCredential`, …) insert directly via
  TypeORM inside a transaction the test rolls back. No process spawning, no gRPC, no outbox
  claiming — it never competes with a real worker for a job row. Product code (`apps/*`,
  `packages/database`, `packages/domain`, …) never imports it; it is test-only.
- **`@patches/harness`** = **processes + RPCs**. `patches-harness` (`mise run lab`) owns
  building and spawning a disposable local server+worker, proving process ownership via
  `/proc` before touching anything, and driving that live process through `@patches/client`
  gRPC calls (`register`/`login`/`post`/`follow`/`notifications`/`world-ensure`) and now
  Mailpit HTTP retrieval (below). It is a CLI, not a library product code links against.
- **`apps/admin`** = **audited operator verbs**. A plain TypeScript CLI (no NestJS) that talks
  to Postgres directly for real operational actions (invite management, moderation) — every
  verb is meant to be run against a real environment and is logged/audited accordingly, unlike
  the harness's disposable throwaway lab.
- **MCP (`.codex/config.toml`'s isolated Playwright server, § below)** = **delivery**. It gives
  an agent a headless browser to _observe_ the running system (screenshots, accessibility
  snapshots); it has no fixture-creation or process-lifecycle powers of its own — it drives
  whatever `lab`/`world-ensure` already stood up.

A task that seeds DB rows belongs in `testkit`; a task that needs a live process or an RPC
response belongs in `harness`; a task that acts on a real deployment belongs in `admin`; a task
that needs pixels/DOM belongs behind the Playwright MCP entry.

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
not yet implement authoritative inverse cleanup. It intentionally does not manage communities or
DMs; notification actions exclude DM notifications and bounded waits observe unread counts only.
`infra/lab/worlds/demo.json` is the committed two-user demo world (a follower + two posts) in this
format, usable for local demos and as the reference shape for further H-015 worlds.

A unit-tested browser-smoke plan lives in `packages/harness/src/browser.ts` (H-018#189): it decides
the loopback origin to drive, the disposable `wk-smoke-*` account, and the compose-to-assert-to-
screenshot steps. Driving that plan through Playwright against a live lab remains planned.

## Mailpit message retrieval

`mise run lab` routes the lab server/worker at `EMAIL_PROVIDER=smtp`,
`SMTP_HOST=127.0.0.1`/`SMTP_PORT=1025` — the same shared, machine-wide Mailpit container
`mise run compose` starts (`infra/compose/docker-compose.yml`'s `mailpit` service; `up` now
brings it up alongside `postgres`) — so verification-code/password-reset emails a harness run
sends are retrievable, not just dropped to `console`.

`mailpit-list [--address <email>] [--limit N]`, `mailpit-latest --address <email>`, and
`mailpit-get --id <id>` (all accept `--origin` to override the default
`http://127.0.0.1:8025`) read that instance's REST API
(`packages/harness/src/mailpit.ts`; response shapes verified live, see
`docs/research/infra-and-security-libs.md` §3). Same discipline as `lab:logs`: the target must
be a loopback `http://127.0.0.1:<port>` origin, list/get output is allowlisted-field JSON
(`id`/`from`/`to`/`subject`/`created`/`snippet`, plus bounded `text` for `mailpit-get` — HTML is
never returned), and an address filter uses Mailpit's own `to:<address>` server-side search
rather than a client-side substring match that could leak the wrong recipient's code. DM
notification observation still waits on B-098 and is unaffected — Mailpit only ever carries
transactional auth-code email in this system, never DM bodies.

## Cross-worktree lab ownership

`mise run lab` state (`infra/lab/.run/harness/state.json`) is per-worktree, but the ports it
binds (`:50058` gRPC, `:8088` HTTP) and the Postgres database it seeds are machine-global — a
second worktree's `up` fails or reports `degraded` against a lab a _different_ worktree started,
and that worktree's own `status`/`down` could only ever see its own empty state file
(`docs/agents/LEARNINGS.md` 2026-08-28).

`status` now resolves the actual pid (and, if `/proc/<pid>/cwd` is readable, the owning
worktree root) bound to the gRPC port before falling back to `down`, and reports
`{"status":"held-by-other-worktree","pid":N,"root":"..."}` instead of a misleading `"down"`.
`down --any` (`mise run lab:down-any`) finds that same owner and stops it regardless of which
worktree ran `up` — preferring the owning worktree's own `state.json` (so both server _and_
worker stop cleanly and that worktree's state is cleared), and falling back to stopping just the
discovered pid, command-line-verified the same way `stopRecordedProcess` verifies its own
processes, if that state can't be read. Never assume a bare `down`/`status` from a fresh
worktree means "nothing is running" — check for `held-by-other-worktree` first.

## Multi-node and federation labs

`mise run lab -- --nodes N` provisions `N` isolated nodes (each with its own database
`patches_harness_lab_<i>`, its own ephemeral Ed25519 keys, and disjoint ports: gRPC
`50100+i`, HTTP `8091+i` — deliberately clear of the single-node `:50058`/`:8088` and the
legacy `fed-lab.sh` `:50061`/`:50062`/`:8081`/`:8082`). `mise run lab -- --federation`
provisions exactly two federating nodes (`a.localhost`/`b.localhost`) with
`FEDERATION_ENABLED=true`, `FEDERATION_STANCE=allowlist`, and a shared
`FEDERATION_KEY_ENCRYPTION_KEY` (base64, 32 bytes). State is a version-2
`HarnessMultiState` (`mode: 'multi' | 'federation'`, `nodes[]`); the single-node
version-1 shape is unchanged. `status`/`down`/`logs`/`reset` handle both shapes, and the
direct gRPC actions accept `--node <index>` to target a specific node (default node 0).

`mise run lab:reset` is an idempotent, **lab-only** reset: it stops this lab's recorded
processes, clears its state, and drops every harness database it created. It refuses to
drop any database whose name fails the harness allow-list (`patches_harness_lab` or
`patches_harness_lab_<n>`), so it can never touch a non-harness database. If the ports are
held by another worktree with no local state, it reports that owner instead of guessing.

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

### Heterogeneous model harness (OpenCode primary, DevPass only)

See `docs/agents/HETEROGENEOUS.md` for the full ladder, pricing cliffs, and `/goal` driver. The durable principle: **smart models remove ambiguity; cheap models execute explicit work; durable board/spec state carries understanding forward.** OpenCode is primary runtime (`goal-driver` = `gpt-5.6-luna` 90k, workers = `deepseek-v4-flash` 140k, senior = `terra` 220k, architect = `grok-4-6` 180k, all via `opencode.json` ceilings). Free `opencode/*-free` models are first fallbacks to exhaust zero-cost capacity. Packets (`.opencode/skills/packet`) ≤15 lines, handoffs (`.opencode/skills/handoff`) ≤20 lines, ≤4 concurrent workers with disjoint paths. `guard-bash.sh` blocks Anthropic models, `git worktree add` by hand, and >6 worktrees (inode/cache guard). All `WebSearch/WebFetch` use is encouraged — pricing and API surfaces change monthly, don't guess.

This repository supports Codex, Claude, and other clients through the same contract:

- The root/main agent orchestrates and gates acceptance. It delegates safely separable
  product/harness implementation instead of competing with workers for the same files.
- A worker owns only the paths in its brief. Parallel briefs have disjoint write sets and state
  that the checkout may be shared; no agent reverts unrelated edits.
- State moves as short packets: done, left, owned paths, verification, and next concrete step.
  Do not keep an implementation worker alive only to preserve context.
- Review is independent and stronger than implementation; verification is a separate evidence
  step when the blast radius warrants it. Neither review nor verification silently changes code.
- Work originates in an explicit user request, the [GitHub Project board](https://github.com/users/alliecatowo/projects/5), or the authoritative spec. Agents may file a concrete, evidence-backed follow-up they discover mid-task as a real GitHub issue on `alliecatowo/patches`, add it to Project #5, and report the URL in their handoff (scope/evidence/acceptance/blocked-by Task IDs/labels) — but do not create work by guessing. A follow-up is concrete when it names the actual scope and evidence from the task; keep it one issue per follow-up, never edit board items outside the ones you filed, and never put secrets into an issue.
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

## Acceptance transcript

Status: `world apply`/`login`/`post`/`notification observation`/`Mailpit`/`teardown` below are
**implemented** and were actually run (2026-08-28, against a live lab another worktree already
had running — `mise run lab` state is per-worktree but the process is machine-global, see
"Cross-worktree lab ownership" above, so this reused it via `PATCHES_HARNESS_ROOT` rather than
starting a second one). Browser visual proof is **planned**: it needs the Playwright MCP driving
a real page against the lab's `webUrl`, which is a manual/interactive step this transcript
couldn't run non-interactively — not yet automated into a scripted harness action.

```
$ node packages/harness/dist/cli.js status
{"status":"running","processes":{"server":"owned-running","worker":"owned-running"},"runId":"1efca3b2...","httpOrigin":"http://127.0.0.1:8088","grpcTarget":"127.0.0.1:50058","database":"patches_harness_lab", ...}

$ node packages/harness/dist/cli.js world-ensure --file world.json   # one user + one post, stable keys
{"users":1,"follows":0,"posts":[{"id":"3f742bb7-...","clientRequestId":"02a3f937-...","requestId":"2feff455-..."}],"requestIds":[...],"sessionsRevoked":true}

$ node packages/harness/dist/cli.js register --handle transcripth191 --email transcripth191@harness.local --password-stdin <<<'a-perfectly-fine-password'
{"actorId":"355c0945-...","handle":"transcripth191","requestId":"7c05d614-...","email":"transcripth191@harness.local","webUrl":"http://127.0.0.1:8088","cleanupRequestId":"73bae5fc-..."}

$ node packages/harness/dist/cli.js login --handle transcripth191 --password-stdin <<<'a-perfectly-fine-password'
{"actorId":"355c0945-...","handle":"transcripth191","requestId":"8137e55c-...","cleanupRequestId":"12d0b616-..."}

$ node packages/harness/dist/cli.js post --handle transcripth191 --password-stdin --body 'hello from the acceptance transcript' <<<'a-perfectly-fine-password'
{"id":"d1a61bff-...","clientRequestId":"26380959-...","requestId":"0423e86a-...","authRequestId":"e390db03-...","cleanupRequestId":"1f99740f-..."}

$ node packages/harness/dist/cli.js notifications --handle transcripth191 --password-stdin <<<'a-perfectly-fine-password'
{"unread":0,"requestIds":["7d50c62a-..."],"notifications":[],"authRequestId":"9acbb540-...","cleanupRequestId":"c0060563-..."}

$ node packages/harness/dist/cli.js mailpit-latest --address transcripth191@harness.local
null
```

The `mailpit-latest` call above genuinely returned `null`: this lab's default `Register` path
(`PASSWORD_AUTH=optional`, no invite requirement) doesn't send a verification email, so nothing
had landed for that address — `mailpit-list --limit 3` against the same shared Mailpit does show
messages from an unrelated live-test run in the same session, confirming the retrieval path
itself works end-to-end (`packages/harness/src/mailpit.test.ts`'s live-gated suite sends a real
message over SMTP and reads it back the same way).

Teardown: `mise run lab:down` stops only processes this worktree's own `state.json` recorded;
`mise run lab:down-any` (exercised via its unit tests and a live `status` proving the pid/root
resolution above — not run destructively against another agent's active lab in this transcript,
deliberately) stops whichever worktree's lab currently holds the ports. `status` is safe to run
at any time and never mutates anything.
