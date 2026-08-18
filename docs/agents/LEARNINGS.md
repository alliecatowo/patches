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
