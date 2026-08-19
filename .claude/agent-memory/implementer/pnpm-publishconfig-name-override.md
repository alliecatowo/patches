---
name: pnpm-publishconfig-name-override
description: pnpm 11.18+ publishConfig.name publishes a workspace package under a different npm name without renaming the workspace-local package.json name, so turbo/pnpm --filter references elsewhere stay untouched
metadata:
  type: feedback
---

When a workspace package's real name is taken on npm (e.g. `@patches/tui`'s bin package
wanted the bare name `patches`, which was taken; `patches-social` was free), don't rename the
workspace `package.json` `name` field — that breaks every `pnpm --filter <old-name>` / turbo
`--filter=<old-name>` reference across the repo (root `package.json` scripts, `mise.toml`,
CI workflows, `infra/**`), forcing a repo-wide grep-and-rename that's out of scope for a
task briefed to touch one package.

Instead set `publishConfig.name` in that package's `package.json` (pnpm 11.18+, this repo
pins 11.22.0 via `mise.toml` — comfortably new enough). `pnpm pack`/`pnpm publish` rewrite
just the packed `name` field; the workspace-local `name` (and therefore every filter
reference to it) is completely unaffected. Verified: `pnpm --filter @patches/tui pack`
produced a tarball whose packed `package.json` says `"name": "patches-social"`, while
`package.json`'s own `name` field on disk stayed `@patches/tui`.

**Why:** A task brief asked for the rename-everywhere approach as a fallback, but the cleaner
mechanism (confirmed via a `researcher` subagent against https://pnpm.io/package_json) let me
stay inside the task's stated file-ownership boundary instead of touching `mise.toml`, root
`package.json`, CI workflows, and `infra/lab/*` — all outside scope and all being edited
concurrently by other agents in the same shared checkout.

**How to apply:** Any time a package's _published_ npm name needs to differ from its
workspace-local name (taken name, org-scoped internally but public externally, etc.), reach
for `publishConfig.name` before reaching for a real rename. Always verify by inspecting the
actual packed `package.json` (`tar -xzf` the tarball), not just trusting the docs claim.

Related: [[proto-nestjs-value-export-leak]]
