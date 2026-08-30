# Issue #432 run log

- 2026-08-30: Confirmed no `ChangePassword` symbol existed in proto, server, TUI, or web.
- 2026-08-30: GitHub issue moved Todo → In Progress and workpad comment created.
- 2026-08-30: `git fetch/rebase` could not run because `.git/FETCH_HEAD` is read-only.
- 2026-08-30: `pnpm proto:gen` could not run because the managed pnpm store is read-only and
  dependencies are unavailable; direct `buf generate` also lacks local protoc plugins.
