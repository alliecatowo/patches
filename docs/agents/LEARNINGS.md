# Learnings

Append-only log of non-obvious gotchas, wrong assumptions, and better patterns discovered while
working on Patches. Managed via `/retro` — grep before adding to avoid duplicates. **Every entry
is ≤6 lines total** (header + fields): if the learning is fully encoded in a rule, research doc,
or agent-memory file, write 1-2 lines with a pointer; only genuinely un-encoded detail earns more
room, and even then keep it tight. `session-start.sh` prints the open-task count at session start,
not this file's size — skim the newest few entries before starting work regardless.

Format: `## YYYY-MM-DD — <short title>` then **Learning:** and **Action taken:** (pointer or fix).

## 2026-08-17 — TypeScript 7 unusable here yet

TS7 (native compiler) is latest on npm, but `typescript-eslint` 8.x peer-deps `<6.1` and Nest's
decorator metadata is unverified against it. **Action taken:** pinned TS 5.9, `docs/decisions/0009-typescript-5-not-7.md`, CLAUDE.md toolchain.

## 2026-08-17 — pnpm 11 build-script gating

pnpm 11 blocks postinstall scripts unless listed in `allowBuilds` (not the old
`onlyBuiltDependencies`); `.npmrc` here is registry-auth only. **Action taken:**
`docs/agents/PACKAGE_CONVENTIONS.md`.

## 2026-08-17 — NestJS 11 has no native ESM support

**Action taken:** `apps/server|worker|admin` CJS, `packages/*` ESM dual-build. Encoded in
`docs/agents/PACKAGE_CONVENTIONS.md` and `.claude/rules/server.md`.

## 2026-08-17 — Ink strips APC image sequences inside `<Text>`

**Action taken:** transmit Kitty APC via `process.stdout.write` directly, never Ink's text tree;
never `wrap="truncate"` a placeholder row. Encoded in `docs/research/ink-kitty-graphics.md` and
`.claude/rules/tui.md`.

## 2026-08-17 — Ghostty 1.3 supports Kitty unicode placeholders

Verified by reading Ghostty's own source. **Action taken:** noted in
`docs/research/ink-kitty-graphics.md`'s terminal support matrix.

## 2026-08-17 — Fedora SELinux needs `:z`; this machine has podman, not docker

**Action taken:** `mise run compose -- <args>` wraps both; compose mounts use `:z`. Encoded in
CLAUDE.md toolchain and `docs/operations/local-development.md`.

## 2026-08-17 — `typeorm-naming-strategies` isn't TypeORM 1.x compatible

Its latest published version peer-deps `^0.2.0 || ^0.3.0`, no `1.x`. **Action taken:** custom
`SnakeNamingStrategy` in `packages/database/src/naming-strategy.ts`; `.claude/rules/database.md`.

## 2026-08-17 — TypeORM 1.x: non-nullable relations now INNER JOIN, `where: {x: null}` throws

Both are silent-result-change breaks from 0.3.x, not compile errors. **Action taken:** encoded as
explicit review points in `.claude/rules/database.md`.

## 2026-08-17 — `git add -A` sweeps other agents' half-done files into your commit

**Action taken:** now hard-blocked by `.claude/hooks/guard-bash.sh`; also stated in
`implementer.md` and CLAUDE.md working agreement #1.

## 2026-08-17 — Concurrent `pnpm add` races on the lockfile

**Action taken:** `flock /tmp/patches-pnpm.lock pnpm add ...` required whenever agents may run
concurrently. Encoded in `docs/agents/PACKAGE_CONVENTIONS.md` and `implementer.md`.

## 2026-08-17 — tsup's `.d.ts` build fails `TS5074` if `incremental` is inherited

**Action taken:** `tsconfig.base.json` sets `incremental: false`; opt in locally. Encoded in
`docs/agents/PACKAGE_CONVENTIONS.md`.

## 2026-08-17 — Ink 7 `useInput` throws when stdin isn't a TTY

**Action taken:** gate on `useStdin().isRawModeSupported`; non-interactive subcommands
(`ping`/`--version`) for scripted checks. Encoded in `.claude/rules/tui.md`.

## 2026-08-17 — Nest interceptor + AsyncLocalStorage: wrap the subscription, not `next.handle()`

`next.handle()` only builds the Observable; the handler runs on subscribe. **Action taken:**
encoded in `.claude/rules/server.md` "Request context".

## 2026-08-17 — Vitest collects compiled tests from `dist/` unless `include` is scoped

**Action taken:** package `vitest.config.ts` scopes `test.include` to `src/**`/`test/**`. Encoded
in `docs/agents/PACKAGE_CONVENTIONS.md`.

## 2026-08-17 — proto-loader never yields `Date`; don't generate with `useDate=true`

Runtime serializer (`longs: String`) delivers `{seconds, nanos}`, not `Date`. **Action taken:**
`useDate=false,forceLong=string` + helpers. Encoded in `.claude/rules/proto.md`.

## 2026-08-17 — `buf breaking --against '.git#...'` resolves relative to cwd

**Action taken:** `packages/proto/scripts/breaking.sh` handles both cases and the no-protos-yet
base branch. Encoded in `.claude/rules/proto.md` ("don't call `buf breaking` by hand").

## 2026-08-17 — Verifying a TTY app from a non-TTY agent shell

**Action taken:** full method (tmux capture, ghostty+pty for a real terminal, GNOME screenshot
limits) moved to `.claude/rules/tui.md` "Non-TTY safety and verification".

## 2026-08-17 — Agent commands rejected when chained with `pkill`/`rm -rf`/compound commits

**Action taken:** keep destructive/process-control steps as separate minimal commands; `git commit`
on its own. Encoded in `.claude/agents/implementer.md` "Command hygiene".

## 2026-08-18 — `@nestjs/config` reads `<cwd>/.env`; tests became cwd-dependent

**Action taken:** `ignoreEnvFile: true` + explicit `main.ts` load; `abortOnError: false` in test
bootstraps; env set in Vitest `setupFiles`. Encoded in `.claude/rules/server.md` "Gotchas".

## 2026-08-18 — Auth implementation gotchas (P1-003..009)

Refresh-token reuse detection must revoke the token family in its own transaction (caller's
rollback otherwise undoes it). `@node-rs/argon2`'s `Algorithm` is an ambient `const enum` — pass
the numeric value under `isolatedModules`. `CryptoKey` is a global value but not a global type
under `types: ["node"]`. Two access tokens minted in the same second need a `jti` to differ. SSH
signature verification is pure `node:crypto` (no library needed). **Action taken:** none further — informational.

## 2026-08-18 — A "finished" report reading like a plan means `maxTurns` ran out

**Action taken:** resume with `SendMessage` + a tight numbered wrap-up brief (verify → tick →
commit explicit paths → report); work in the tree is preserved. Encoded in CLAUDE.md tool use.

## 2026-08-18 — Postgres: a no-match conditional UPDATE still holds the row lock cross-connection

**Action taken:** do side-effect writes after the detecting transaction settles, not from a second
connection while it's open. Full detail: `.claude/agent-memory/implementer/postgres-cross-connection-self-deadlock.md`.

## 2026-08-18 — `apps/tui` Ink-render tests flake under vitest's default file parallelism

**Action taken:** `apps/tui/vitest.config.ts` sets `fileParallelism: false`. Full detail moved to
`.claude/rules/tui.md` "Testing".

## 2026-08-18 — `apps/server`'s full integration suite occasionally flakes with a spurious `UNIMPLEMENTED`

New RPCs (`LikePost`, `ReportPost`, `MuteActor`) intermittently fail across the ~24-file serial
integration suite, never in isolation; re-running 1-2x turns it green. Leading suspect: a
`@grpc/proto-loader`/grpc-js service-registration race across many sequential microservice boots,
unconfirmed. **Action taken:** none yet — if it blocks CI, next step is `harness-tuner` bisecting
port-release timing or sharing the loaded schema across `startTestServer()` calls.

## 2026-08-18 — proto message-typed fields stay `T | undefined` even with `useOptionals=none`

**Action taken:** build responses from the DTO's own always-present fields, not by destructuring a
`toProtoXxx()` mapper's return. Encoded in `.claude/rules/proto.md`.

## 2026-08-18 — `TRUNCATE ... CASCADE` also empties tables that merely reference the target

Ignores `onDelete`; wipes any table with an FK pointing at the truncated one, not just rows that
reference a doomed row. Also: hook-log print ordering (`beforeAll` vs `it`) isn't proof of actual
execution order when diagnosing this. **Action taken:** encoded in `.claude/rules/database.md`.

## 2026-08-18 — `waitForFrame`/`expectFrame` polling trades a flake for two subtler bugs

**Action taken:** full detail (premature substring resolution, missing settle grace period) moved
to `.claude/rules/tui.md` "Testing". Verify a de-flake by running the single test in isolation
(`vitest run <file> -t "<title>"`), not just "the file passed a few times".

## 2026-08-18 — `useInput` index/mode state needs the functional `setState` form

A tight loop of key presses with no `await` between them all read the same stale render-closure
value. **Action taken:** encoded in `.claude/rules/tui.md` "Input dispatch".

## 2026-08-18 — Nest hybrid apps drop global `APP_FILTER`/`APP_INTERCEPTOR` from microservices

`app.connectMicroservice(options)` needs `{ inheritAppConfig: true }` or globals never apply; test
bootstraps must mirror `main.ts` exactly. **Action taken:** encoded in `.claude/rules/server.md`.

## 2026-08-18 — Connect edge (ADR 0016, P10-004): three gotchas

`protoc-gen-es` needs `import_extension=js` for NodeNext; a module can't be conditionally excluded
from `AppModule` if another always-on module also imports it (split gateway from controllers); a
global exception filter for one HTTP surface must not blanket-500 a second one's normal 404s.
**Action taken:** all three encoded in `.claude/rules/proto.md` and `.claude/rules/server.md`.

## 2026-08-19 — Phase 12 TUI wave: uncommitted WIP and host-dependent tests

Commit per green slice, not per session — a prior wave lost a full session's worth of
distinguishing done-vs-half-done work to an uncommitted ~60-file WIP pile. `FORCE_COLOR` in a
shell silently rewrites Ink frame assertions (fix + detail: `.claude/rules/tui.md` "Testing").
Window-size/measurement/`display:none`-vs-`height:0` layout hazards are encoded in
`.claude/rules/tui.md` "Measured layout". **Action taken:** see those sections.

## 2026-08-19 — `startTestServer()` without `{ http: true }` never fires `OnModuleInit`

**Action taken:** pass `{ http: true }` for any test asserting on boot-time seeded state. Encoded
in `.claude/rules/server.md` and `.claude/agent-memory/implementer/nest-testserver-onmoduleinit-needs-http-true.md`.

## 2026-08-19 — Edit tool can silently drop a literal ESC byte from a copied test fixture

**Action taken:** write control-byte stdin sequences as explicit JS escapes (`'\x1b[200~...'`), not
by copying an existing literal-byte string through Edit. Full detail:
`.claude/agent-memory/implementer/edit-tool-strips-literal-control-bytes.md`.

## 2026-08-19 — Test a `renderArtPreview` consumer against its own output, not a regex

`AsciiRenderer`/`HalfBlockRenderer` use different glyph sets by color-support detection. **Action
taken:** encoded in `.claude/rules/tui.md` "Testing".

## 2026-08-19 — Adding a `repeated` proto field is wire-additive but source-breaking

ts-proto emits non-optional arrays; every existing literal for that message needs the field added
by hand. **Action taken:** `grep -rln` the RPC name repo-wide before calling it done. Encoded in
`.claude/rules/proto.md` and `.claude/agent-memory/implementer/ts-proto-repeated-field-non-optional.md`.

## 2026-08-19 — `@patches/database`'s `FilterScope` entity class shadows its own value-type alias

**Action taken:** check `packages/database/src/index.ts` for an `X as XValue` pattern before
aliasing an import. Full detail:
`.claude/agent-memory/implementer/database-entity-value-export-shadows-type-alias.md`.

## 2026-08-19 — Context-economy rules stayed prose-only and weren't holding (H-010)

**Superseded.** The `maxTurns: 12-40` / `trim-output.sh` / `AUTO_COMPACT_WINDOW=100000` fixes this
entry describes were later reverted (maxTurns is now a flat 100/verifier 40 runaway backstop,
`trim-output.sh` deleted, window is 500000) — kept for history only, see the next entry and
`docs/agents/CONTEXT_ECONOMY.md` for current numbers and reasoning.

## 2026-08-19 — H-010's numbers were inflated ~40% by a double-count bug; `LSP` wired in

Claude Code repeats one `message.usage` object across every JSONL line of a request; summing per
line instead of per `message.id` inflated totals and invented fake "zero-tool turns". **Action
taken:** corrected method and numbers live in `docs/agents/CONTEXT_ECONOMY.md`; `LSP` added to
read-heavy agents.

## 2026-08-19 — Mid-run coordinator messages get refused; `LSP` goes blind mid-rebuild

A `system-reminder`-wrapped orchestrator message is the most authoritative instruction an agent
has and shouldn't be refused by default; a transient `LSP` cross-package error during a concurrent
rebuild is a timing artifact, not a finding. **Action taken:** encoded in every `.claude/agents/*.md`'s "mid-run message" note and the `LSP` dist-rebuild caveat in `implementer.md`/`reviewer.md`.

## 2026-08-19 — WorktreeCreate hook: must echo path to stdout, isolation is opt-in per call

The harness `WorktreeCreate` hook (`.claude/hooks/worktree-setup.sh`) must CREATE the worktree and
echo its absolute path on stdout. The original version only ran `pnpm install` and printed nothing,
so every `isolation: worktree` agent aborted immediately with "hook succeeded but returned no
worktree path" — three implementer spawns died before doing any work.

Two further things were learned the hard way once the hook did create worktrees:

- **Nothing may prune worktrees while agents are live.** A cleanup agent running `git worktree
remove --force` on its own test worktrees deleted three _running_ agents' trees out from under
  them; all three lost their research and reported "worktree removed, cannot proceed".
- **A fresh worktree is not a working checkout until it is BUILT.** `dist/` is gitignored, so every
  cross-package import in a new worktree resolves to an untyped `.js` — "Could not find a
  declaration file for module '@patches/proto'" on essentially every file, which reads like a
  broken agent rather than a missing build. `pnpm install` alone is not enough; the hook must also
  run `turbo run build`. A `--cache-dir` shared across worktrees keeps this at ~44s.
- **A hook cannot opt out of isolation by echoing the main checkout** — the harness rejects it with
  "cannot be confirmed as a separate isolation worktree". Isolation is turned off by removing
  `isolation: worktree` from the agent definition, and a definition edited mid-session does not take
  effect for that session; spawn a different `subagent_type` instead.

**Action taken:** hook rewritten to create a detached worktree, `flock`-install, and echo the path;
`isolation: worktree` removed from `implementer.md` frontmatter — isolation stays opt-in per `Agent`
call, since disjoint file sets per brief already keep parallel agents safe and merging N worktrees
back is friction we do not want. Both cautions are recorded in the hook's header comment.

## 2026-08-20 — `@inkjs/ui`'s measure-then-setState components never converge under Ink 7 + React 19

`@inkjs/ui`'s `ProgressBar` starts at width 0, calls `measureElement` on itself, then `setWidth`
_during render_ to draw. That cycle never settled here: the bar stayed at width 0 forever, and
because it was the widest child of a `flexDirection="column"` Box, the column collapsed and the
sibling `<Text wrap="truncate-end">` label truncated to the empty string — so the whole component
rendered as two blank rows, in tests **and** in a real terminal. Its own tests passed only because
a neighbouring test file happened to run first under `fileParallelism: false`, and failed the
moment file order changed. **Action taken:** replaced with a fixed-width bar (deterministic, no
measurement pass, rich and plain identically sized) and dropped `@inkjs/ui` from `apps/tui`. Treat
any self-measuring third-party Ink component as suspect; prefer a fixed width.

## 2026-08-20 — Ink lays out at width 0 when `process.stdout.columns` is undefined

Non-TTY shells (CI, every agent shell) leave `columns` undefined, so Ink's layout width is 0 and
any `wrap="truncate-end"` text renders empty. Frame assertions then depend on how the suite was
launched, exactly like the `FORCE_COLOR` problem above. **Action taken:** `apps/tui/test/setup-terminal.ts`
pins 100x30 via `setupFiles` in `apps/tui/vitest.config.ts`.

## 2026-08-20 — A slow-but-correct test with vitest's 5s default fails only under parallel load

Two crypto fuzz tests (50 and 100 real X25519/AEAD iterations) and the rate-limit capacity test
(20,000 bucket insertions) finish in well under a second idle, but overran the 5s default whenever
an agent was building another workspace concurrently — failing `pnpm verify` twice on timing rather
than on code, and costing a push each time. **Action taken:** explicit 30s timeouts on those three.
Give any test doing real crypto or five-figure loop counts an explicit timeout.

## 2026-08-20 — A defaulted constructor param typed as an interface breaks Nest DI, and `verify` cannot see it

`emitDecoratorMetadata` cannot emit an interface, so it records `design:paramtypes` as `Object`.
Nest then tries to resolve `Object` as a provider token and fails — **the default value is
ignored**. `E2eeReportEvidenceService(dataSource, keys: NodeFrankingKeyRing = new Env...())` boot-
looped `patches-social` until the machine hit its restart cap. Once a machine exceeds that cap it
stays `stopped` and a redeploy alone will not revive it: `flyctl machine start <id>` is required.

The alarming part is what stayed green: typecheck, lint, and all 2560 unit tests. Unit tests
construct services directly and never build the DI graph, and the integration suites that _do_ boot
the app skip silently without `TEST_DATABASE_URL` — so `pnpm verify` never boots the app at all.
**Action taken:** `@Optional()` on the param, and `apps/server/src/di-graph.test.ts` now walks the
module graph from `AppModule` asserting no unresolvable `Object` param lacks `@Optional()`/
`@Inject()` — no DB, milliseconds, runs in the fast suite. Verified it reports the real defect when
run against the unfixed service. **After any deploy, check `flyctl status` and ping the node — a
successful `flyctl deploy` exit does not mean the app booted.**

## A proto family swap can change rendered output while typechecking clean (2026-08-20, P10-013/P10-020)

ADR 0023's premise for the TUI's ts-proto → protobuf-es migration was that the enum seam
absorbed the difference, because both generators name their members identically
(`AppealStatus.OPEN` reads the same either way). That is true for _references_ and false for
_values_: ts-proto's enums are string-valued (`'APPEAL_STATUS_OPEN'`), protoc-gen-es's are
numeric (`1`). So `` `${appeal.status}` `` silently went from printing a name to printing a
number in `patches appeal list`, `patches lists`, and the notifications screen.

The typechecker cannot see this — both sides have the same TS enum type — and `mise run check`
was green on typecheck for the whole flip. Only the runtime tests caught it, and only because
they assert on literal output.

Two rules fall out:

1. When swapping code generators, the invariant to check is not "do the names match" but "does
   every observable — rendered text, JSON shape, wire bytes — match". Names matching is what
   makes the diff look safe; values not matching is what breaks it.
2. A task whose defining constraint is "no behavior change" needs at least one assertion on real
   output per surface, or the constraint is unenforced. `client.ts` shrank from 1864 lines to 302
   with a clean typecheck and a user-visible regression in the same commit.

The fix is `enumWireName(schema, value)` in `apps/tui/src/api/wire/enums.ts`, over protobuf-es's
`enumToJson`, which reads the generated descriptor and returns the proto wire name — so it is
byte-identical to what ts-proto used to interpolate, rather than a hand-maintained lookup table
that would drift from the .proto.
