# Issue #420 handoff

Implementation is present in the workspace for the delivery harness to commit.

- Added `pnpm lint:changed`, which unions committed, staged, unstaged, and untracked changed files and runs ESLint with `--no-cache`.
- Added the uncached pass to `mise run check <workspace>` and CI quality.
- Documented when scoped Turbo checks are cache-suspect in `docs/operations/ci.md`.
- Validation evidence is in `run-log.md`; mise itself was unavailable because the managed environment could not write its trusted-config state.
