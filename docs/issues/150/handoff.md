# Issue #150 handoff

## Completed

- Added `docs/decisions/0039-e2ee-only-direct-messages-and-honest-copy.md` and indexed it.
- Updated `CLAUDE.md` and `AGENTS.md` to remove the unconditional server-visible rule while
  preserving no-DM-body telemetry restrictions and the federation seam.
- Updated active README, mobile registration, production privacy summary, and preview privacy
  summary to describe E2EE-only behavior and honest limitations.

## Validation

- `git diff --check`: passed.
- Direct pinned Prettier check on changed Markdown/TSX files: passed after formatting the two CI-
  flagged files (`apps/mobile/src/screens/RegisterScreen.tsx`, `docs/decisions/README.md`).
- Targeted stale-rule search: no stale unconditional harness rule remains; historical ADR/spec
  references are intentionally retained.
- ADR 0039 index-link assertion: passed.
- Full mise checks remain unavailable because the workspace `mise.toml` is untrusted and the
  unattended worker cannot run `mise trust`.
- Scoped pnpm Turbo lint/typecheck could not start: pnpm attempted a symlink in the read-only pnpm
  store (`EROFS`).

## Delivery boundary

Changes are intentionally uncommitted and unpublished for the delivery harness. No PR, CI wait,
remote review, or merge action was performed.
