# Learnings

Append-only log of non-obvious gotchas, wrong assumptions, and better patterns discovered
while working on Patches. Managed via `/retro` — grep before adding to avoid duplicates, and
keep entries brief. `session-start.sh` prints the entry count at the start of every session;
skim the newest few before starting work.

Format:

```
## YYYY-MM-DD — <short title>

**Context:** <what you were doing when you hit this>

**Learning:** <the non-obvious fact, gotcha, or better pattern>

**Action taken:** <file changed as a result, or "none — informational only">
```

## 2026-08-17 — TypeScript 7 exists on npm but isn't usable here yet

**Context:** Pinning the TypeScript version for the monorepo toolchain.

**Learning:** TypeScript 7 (the native Go-ported compiler) is the latest package published
as `typescript` on npm, but `typescript-eslint` 8.x — required for linting — declares a peer
dependency on `typescript <6.1`, and NestJS's decorator/`emitDecoratorMetadata` behavior
hasn't been validated against it. Using it would risk silent linting gaps or decorator
miscompilation.

**Action taken:** Pinned `typescript: ^5.9.3` in the `catalog:` (`pnpm-workspace.yaml`);
documented in `docs/decisions/0009-typescript-5-not-7.md`. `mise.toml` and `CLAUDE.md` both
call out TS 5.9, not 7, explicitly.

## 2026-08-17 — pnpm 11 build-script gating and .npmrc scope

**Context:** Setting up native dependencies (sharp, argon2, keyring) in the monorepo.

**Learning:** pnpm 11 blocks postinstall/build scripts for any dependency not explicitly
allowed; `onlyBuiltDependencies` from earlier pnpm versions is superseded by `allowBuilds` in
`pnpm-workspace.yaml`. `.npmrc` in this repo is registry-auth configuration only — it does
not control build-script allowlisting.

**Action taken:** `allowBuilds` list added to `pnpm-workspace.yaml` for `sharp`, `@swc/core`,
`esbuild`, `@napi-rs/keyring`, `@node-rs/argon2`, `protobufjs`, `unrs-resolver`; documented in
`docs/agents/PACKAGE_CONVENTIONS.md`.

## 2026-08-17 — NestJS 11 has no native ESM support

**Context:** Deciding module format per workspace (`docs/agents/PACKAGE_CONVENTIONS.md`).

**Learning:** NestJS 11's DI/decorator machinery assumes CommonJS; there's no supported
native-ESM path. Shared packages still need to be consumable by both the CJS server and the
ESM-only Ink TUI.

**Action taken:** `apps/server`/`apps/worker`/`apps/admin` are CJS (`module: NodeNext`, no
`"type": "module"`); `packages/*` are ESM source, dual-built (`tsup --format esm,cjs`) with an
`exports` map. Documented in `docs/agents/PACKAGE_CONVENTIONS.md` and `.claude/rules/server.md`.

## 2026-08-17 — Ink strips APC escape sequences inside `<Text>`

**Context:** Kitty graphics protocol spike for inline image rendering in the TUI.

**Learning:** Ink's `build/sanitize-ansi.js` (via `squash-text-nodes.js`) silently strips raw
APC escape sequences (`\x1b_G...\x1b\\`) placed inside `<Text>` — the image data never
reaches the terminal. Separately, `wrap="truncate"`/`truncate*` appends `…` (U+2026) via
`cli-truncate`, which corrupts a unicode-placeholder grid if used on a placeholder row.

**Action taken:** Transmit Kitty image APC sequences via `process.stdout.write` directly
(after `unmount()`/from a signal handler), never through Ink's text tree. Never
`wrap="truncate"` a placeholder row. Documented in `docs/research/ink-kitty-graphics.md` and
`.claude/rules/tui.md`.

## 2026-08-17 — Ghostty 1.3 supports Kitty unicode placeholders

**Context:** Same Kitty graphics spike — checking terminal compatibility beyond kitty itself.

**Learning:** Ghostty 1.3 supports the Kitty graphics protocol's unicode-placeholder mode
(verified by reading Ghostty's own source, not just release notes), making it a second viable
target terminal alongside kitty itself for the inline-image feature.

**Action taken:** Noted in `docs/research/ink-kitty-graphics.md`'s terminal support matrix.

## 2026-08-17 — Fedora SELinux needs `:z` on compose bind mounts; docker vs. podman

**Context:** Setting up `infra/compose` for local Postgres/mailpit on this development
machine (Fedora).

**Learning:** SELinux-enforcing Fedora needs bind-mounted volumes labeled with `:z` (or `:Z`)
in compose files or the container can't read/write them. This machine also has podman, not
docker, installed — `docker compose` isn't directly available.

**Action taken:** `mise run compose -- <args>` wraps `docker compose`/`podman compose`
transparently; compose volume mounts use `:z`. Documented in `CLAUDE.md`'s toolchain section
and `docs/operations/local-development.md`.

## 2026-08-17 — `typeorm-naming-strategies` is not TypeORM 1.x compatible

**Context:** Picking a snake_case naming strategy for `packages/database`.

**Learning:** `typeorm-naming-strategies`'s latest published version (4.1.0, checked via npm
registry) declares `peerDependencies: { typeorm: "^0.2.0 || ^0.3.0" }` — no `1.x` range.
Installing it anyway would silently work at install time and break/misbehave at runtime.

**Action taken:** Wrote a custom `SnakeNamingStrategy` implementing TypeORM's
`NamingStrategyInterface` directly in `packages/database/src/naming-strategy.ts`. Documented
in `docs/research/typeorm-postgres.md` and `.claude/rules/database.md`.

## 2026-08-17 — TypeORM 1.x: INNER JOIN default for non-nullable relations, `where: {x: null}` throws

**Context:** Same TypeORM 1.x research pass — auditing breaking changes vs. 0.3.x.

**Learning:** Two behavior changes that silently change query results rather than erroring at
compile time: (1) `@ManyToOne(..., { nullable: false })` relations loaded via the `relations`
find-option now generate INNER JOIN instead of LEFT JOIN, which can drop rows a report/query
previously expected to keep; (2) `where: { x: null }` throws by default
(`invalidWhereValuesBehavior`) instead of matching NULL — use `IsNull()`.

**Action taken:** Documented in `docs/research/typeorm-postgres.md` and `.claude/rules/database.md`
as explicit review points for anyone writing a query against a nullable-in-practice relation
or an equality-to-null filter.

## 2026-08-17 — `git add -A` sweeps other agents' half-done files into your commit

**Context:** Running multiple implementer agents concurrently in the same working tree.

**Learning:** With several agents editing disjoint paths in parallel, `git add -A`/`git add .`
stages whatever any agent happened to leave in the tree at that moment, not just your own
work — producing commits that mix in unrelated, half-finished changes from another agent's
task.

**Action taken:** `.claude/agents/implementer.md` and `docs/agents/HARNESS.md` both state
explicitly: stage only the exact paths you were assigned, never `-A`/`.`.

## 2026-08-17 — Concurrent `pnpm add` races on the lockfile

**Context:** Multiple agents adding dependencies to different packages at the same time.

**Learning:** `pnpm-lock.yaml` is a single shared file; two concurrent `pnpm add` invocations
can interleave their writes and corrupt it, even though the packages being added are
unrelated.

**Action taken:** `docs/agents/PACKAGE_CONVENTIONS.md` and `.claude/agents/implementer.md`
require wrapping installs in `flock /tmp/patches-pnpm.lock pnpm add ...` whenever multiple
agents may be running concurrently.

## 2026-08-17 — tsup `dts` fails with TS5074 when `incremental: true`

**Context:** Every tsup-built package (`config`, `database`, `testkit`, `proto`, `terminal-media`) hit
`error TS5074: Option '--incremental' can only be specified using tsconfig, emitting to single file or when option '--tsBuildInfoFile' is specified` during the `.d.ts` build.

**Learning:** tsup's DTS worker invokes the TS API without a `tsBuildInfoFile`; `incremental` inherited
from `tsconfig.base.json` breaks it.

**Action taken:** `tsconfig.base.json` now sets `incremental: false`; apps that want incremental tsc
builds opt in locally.

## 2026-08-17 — Ink 7 `useInput` throws when stdin is not a TTY

**Context:** Piping into the TUI (or running under CI) crashed with a React stack trace.

**Learning:** `useInput` calls `setRawMode`, which throws when raw mode is unsupported. Gate on
`useStdin().isRawModeSupported`, and provide non-interactive subcommands (`patches ping`,
`--version`) for scripted checks.

**Action taken:** `apps/tui` guards `useInput`; `.claude/rules/tui.md` mentions the guard.

## 2026-08-17 — Nest interceptor + AsyncLocalStorage: wrap the subscription, not `next.handle()`

**Context:** Request-context (request id) was empty inside controllers.

**Learning:** `next.handle()` only builds the Observable; the handler runs on subscription. The
`AsyncLocalStorage.run(store, ...)` must wrap `next.handle().subscribe(...)` (or use `defer`).

**Action taken:** Implemented that way in `apps/server/src/common/interceptors`; noted in
`.claude/rules/server.md`.

## 2026-08-17 — Vitest collects compiled tests from `dist/` unless `include` is scoped

**Context:** Tests ran twice after `pnpm build`.

**Learning:** A package vitest project must scope `test.include` to `src/**`/`test/**` (or exclude
`dist/**`), otherwise the emitted `dist/**/*.test.js` are collected too.

**Action taken:** Package `vitest.config.ts` files scope `include`; conventions doc updated.

## 2026-08-17 — proto-loader never yields `Date`; don't generate with `useDate=true`

**Context:** ts-proto `useDate=true` produced `Date`-typed Timestamp fields, but the runtime
serializer (`@grpc/proto-loader` with `longs: String`) delivers `{seconds: string, nanos: number}`.

**Learning:** Generated types must describe what the runtime serializer actually produces. We use
`useDate=false,forceLong=string` and explicit `dateToTimestamp`/`timestampToDate` helpers, pinned by
an integration test.

**Action taken:** `packages/proto/buf.gen.yaml` + `.claude/rules/proto.md`; research doc corrected.

## 2026-08-17 — `buf breaking --against '.git#...'` resolves relative to cwd

**Context:** The research note's command failed from `packages/proto` ("does not appear to be a git repository").

**Learning:** The `.git#branch=…,subdir=…` ref is resolved from the current directory, so from a package
dir it must be `../../.git#…`. It also errors when the base branch has no protos yet.

**Action taken:** `packages/proto/scripts/breaking.sh` handles both (and falls back to `origin/main`);
CI calls `pnpm proto:breaking` with no args.

## 2026-08-17 — Verifying a TTY app from a non-TTY agent shell

**Context:** Needed to prove Kitty detection and the full-screen TUI without an interactive terminal.

**Learning:** (1) `tmux new-session -d … ; tmux send-keys; tmux capture-pane -p` drives Ink apps and
captures text frames (Kitty graphics show as placeholders/fallback there — tmux is treated as
unsupported). (2) To run inside a _real_ Ghostty and still capture output, `ghostty -e wrapper.sh` with
Python's `pty.spawn` logging (`script` isn't installed on Fedora by default). Redirecting stdout to a
file makes the app see "not a TTY". (3) GNOME denies `org.gnome.Shell.Screenshot` to arbitrary
callers, so pixel screenshots need the human.

**Action taken:** Recorded here; `.claude/skills/verify/SKILL.md` links to this entry for TUI checks.

## 2026-08-17 — Agent commands get rejected when chained with `pkill`/`rm -rf`/compound commits

**Context:** Two implementers paused mid-task because a compound command (`… && pkill … && git commit`) was rejected by the permission layer.

**Learning:** Keep destructive/process-control steps as separate, minimal commands (`kill <pid>`), and run
`git commit` on its own; agents should never wait on the orchestrator for that.

**Action taken:** `.claude/agents/implementer.md` instructs: single-purpose commands, kill by PID, commit separately.

## 2026-08-18 — `@nestjs/config` reads `<cwd>/.env` by default; tests became cwd-dependent

**Context:** Server auth integration tests passed from `apps/server` but failed from the repo root with "invite code is not valid": the server had booted against the dev `DATABASE_URL`.

**Learning:** `ConfigModule.forRoot()` loads `.env` from `process.cwd()` unless `ignoreEnvFile: true`, and it validates `process.env` at _module evaluation_ time (a schema default beats a later `process.env` write). Any env an integration suite needs must be set in a Vitest `setupFiles` entry, not `beforeAll`. Nest's default `abortOnError` turns a failed boot into `process.abort()`, which Vitest reports only as "Worker exited unexpectedly" — pass `abortOnError: false` in test bootstraps.

**Action taken:** `ignoreEnvFile: true` in server + worker config modules (`main.ts` loads `.env` deliberately); `abortOnError: false` in `apps/server/test/support/test-server.ts`; the `server-integration` project skips itself when `TEST_DATABASE_URL` is unset.

## 2026-08-18 — Auth implementation gotchas (from the P1-003..009 agent)

**Learning:** Refresh-token reuse detection must revoke the token family in its _own_ transaction or the caller's rollback undoes it. `@node-rs/argon2`'s `Algorithm` is an ambient `const enum` (unusable under `isolatedModules` — pass the numeric value / a local const). `CryptoKey` is a global value but not a global type under `types: ["node"]` — type off jose's return types. Two access tokens minted in the same second are byte-identical without a `jti`. SSH signature verification is pure `node:crypto` (OpenSSH wire parsing + DER re-framing), no library needed.

## 2026-08-18 — Subagents that stop with a mid-sentence "result" have hit their turn cap

**Context:** Three Wave-2 agents "finished" with results like "Now adding the integration test…" — nothing committed.

**Learning:** A completion note that reads like a plan means `maxTurns` ran out. Resume with `SendMessage` and a tight, numbered wrap-up brief (verify → tick → `git add <explicit paths>` → commit → push → report) and a turn budget; work in the tree is preserved.

## 2026-08-18 — Postgres: a no-match conditional UPDATE still holds the row lock; cross-connection revoke self-deadlocks

**Context:** Refresh-token reuse detection ran the family revoke on a second connection from inside the still-open detecting transaction; the new concurrent-rotation test hung forever.

**Learning:** A conditional `UPDATE … WHERE …` that ends up matching nothing has still locked the candidate row until end-of-transaction. Touching that row from another connection while the outer transaction is open blocks — and Postgres's deadlock detector can't see it (one side is idle-in-transaction). Do side-effect writes _after_ the detecting transaction settles (rollback first, then revoke). Also: peer-keyed rate limits need a much higher ceiling than subject-keyed ones, or one gRPC connection reused across a test file trips them.

**Action taken:** `AuthService.refreshSession` defers the revoke; implementer memory `postgres-cross-connection-self-deadlock.md`.

## 2026-08-18 — `apps/tui` Ink-render tests flake under vitest's default file parallelism

**Context:** `pnpm --filter @patches/tui test` intermittently failed one otherwise-deterministic
`ink-testing-library` snapshot assertion (a different test each run) — roughly 1 in 3 runs,
never the same test twice. Bisecting showed it wasn't specific to any one test's logic: it
reproduced on tests that existed and passed reliably before this change too.

**Learning:** Every `apps/tui` test file renders a real Ink tree and drives it via
`harness.tsx`'s `flush()`, a real (not faked) `setTimeout`. With vitest's default
`fileParallelism: true`, 15+ such files run concurrently across worker threads/processes,
and under enough CPU contention a `flush()` occasionally resolved before a React state
update from a promise chain had actually committed — a real race, not a bug in the
component under test. No other package in the repo drives Ink, so this is unique to `tui`.

**Action taken:** `apps/tui/vitest.config.ts` sets `fileParallelism: false` (serializes this
project's test files only — other packages still run in parallel). 9 consecutive full-suite
runs were clean afterward vs. ~1-in-3 failing before. Total suite time roughly doubled
(~6s → ~12s), an acceptable tradeoff for a project this size. If `apps/tui`'s test count
grows enough that serial execution becomes a real cost, the next step would be `pool: 'forks'`
with a small `maxForks` rather than reverting to full parallelism.

## 2026-08-18 — `apps/server`'s full integration suite occasionally flakes with a spurious `UNIMPLEMENTED` on a newly-added RPC

**Context:** Adding `ReactionService`/`NotificationService`/`ModerationService` (P4-002/003,
P6-001/002) and their integration test files, `pnpm test:integration` intermittently failed
several of the _new_ services' RPCs with `12 UNIMPLEMENTED: The server does not implement the
method X` — but running the same new test files alone, or in a smaller combined group, always
passed. The specific RPC that failed varied between runs (`LikePost`, `ReportPost`, `MuteActor`
seen so far), and RPCs on long-established services (`FollowActor`, `CreatePost`) never showed
it.

**Learning:** This looks like a genuine flake tied to how many `NestFactory.createMicroservice
(AppModule, …)` instances get booted back-to-back across the full ~24-file integration suite
(`vitest.integration.config.mts` runs files serially via `fileParallelism: false`, but each
file's `beforeAll` still boots a brand-new Nest gRPC microservice on its own port) — not a bug
in the new controllers' `@XxxServiceControllerMethods()` wiring, which is otherwise identical to
every working service. Re-running the full suite 1-2 more times after a failure reliably turned
it green with no code changes. Not yet root-caused (a `@grpc/proto-loader`/grpc-js
service-registration race under many sequential microservice boots is the leading suspect, but
unconfirmed).

**Action taken:** None yet — documenting so the next agent that hits a "new RPC is
UNIMPLEMENTED but the controller looks right" failure doesn't waste time assuming their wiring
is broken. If this recurs and blocks CI, next step is probably `verifier`/`harness-tuner`
bisecting whether a `grpc.Server` needs to fully release its port before the next one boots, or
whether `@grpc/proto-loader`'s schema should be loaded once and shared across test-server
instances instead of reloaded per `startTestServer()` call.

## 2026-08-18 — proto message-typed fields stay `T | undefined` even with `useOptionals=none`

**Context:** `toReactionResponse` in `reaction.controller.ts` tried to build a
`LikePostResponse` by destructuring `toProtoPost(post).counts`/`.viewerState` — both nested
`PostCounts`/`PostViewerState` message fields — and `tsc` rejected it: `PostCounts | undefined`
is not assignable to a non-optional `{ replies: number; likes: number }`.

**Learning:** `buf.gen.yaml`'s `useOptionals=none` (this repo's setting) only affects _scalar_
proto3 fields — every generated interface still types a nested-message field as `T | undefined`
(exactly like `google.protobuf.Timestamp` fields such as `Post.editedAt`), even though the
mapper always sets a value at runtime. Don't destructure a message-typed field back out of a
`toProtoXxx()` mapper's return value and assume it's non-optional — build the response object
directly from the application DTO's own fields instead (as `post.dto.ts`'s `PostView.counts`/
`viewerState` already guarantee are always-present objects, never `undefined`, at the DTO
layer).

**Action taken:** `reaction.controller.ts`'s `toReactionResponse` builds its return value from
`PostView.counts`/`viewerState` directly rather than through `toProtoPost(...).counts`.

## 2026-08-18 — `TRUNCATE ... CASCADE` on a table also empties tables that merely _reference_ it (not just dependents you'd expect)

**Context:** `apps/worker/test/media-processing.integration.test.ts`'s `beforeEach` ran
`TRUNCATE TABLE "media" RESTART IDENTITY CASCADE` to reset fixture state between tests. A
fixture `actors` row created once in `beforeAll` (needed because `media.owner_actor_id` is
`RESTRICT`) kept disappearing before the first test even ran, causing every `media` insert to
fail with `fk_media_owner_actor_id` — even though a `SELECT` for that exact id immediately
after creation, in the same `beforeAll`, found it fine.

**Learning:** `actors.avatar_media_id` is a nullable FK to `media` (`ManyToOne(() => Media, {
onDelete: 'SET NULL' })`). `TRUNCATE ... CASCADE` doesn't respect a column's `onDelete` action
(that's a `DELETE`-only concept) — it just truncates _every_ table that has any FK pointing at
the truncated table, full stop, regardless of whether any row actually references a to-be-deleted
row. So `TRUNCATE media CASCADE` unconditionally truncates `actors` too (and `post_media`),
wiping fixtures that have nothing to do with the media rows the test actually wanted to clear.
`console.log` ordering across `beforeAll`/`it()` in vitest's default reporter is also not
trustworthy for diagnosing this kind of race — hook-level logs can print _after_ a same-run
`it()`'s logs even though the hook genuinely ran first; verify actual execution order some
other way (e.g. print a value captured in a closure, not just wall-clock proximity of the
printed lines) before concluding hooks ran out of order.

**Action taken:** Changed the `beforeEach` to a plain `DELETE FROM "media"` (no `CASCADE`
needed — nothing referenced the media rows being deleted in that suite). General rule for any
future integration test: before reaching for `TRUNCATE ... CASCADE` on a table with incoming
FKs, check every table that has a FK _pointing at_ it (`grep -rn "() => <Entity>" packages/database/src/entities`), not just the tables you intend to also clear.
