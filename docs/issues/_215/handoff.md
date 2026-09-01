# Issue #215 handoff

Implemented a responsive, scrollable grouped keyboard-shortcuts dialog in `RootLayout`, covering the web client’s actual navigation, post, compose/search, and help shortcuts. Added a regression test that verifies all groups and representative bindings.

Validation:

- `git diff --check` passed.
- `mise run check web` and Vitest could not run because the provided workspace’s `mise.toml` is untrusted and no installed `node_modules`/standalone Vitest binary is present.
- `git pull --ff-only origin main` was attempted before edits but could not open `.git/FETCH_HEAD` because Git metadata is read-only; HEAD remains `0ed916d`.
- Continuation review confirmed the diff is clean (`git diff --check`). The focused web test command was attempted and could not start because `mise.toml` is untrusted and dependencies/Vitest are absent.

The workspace is intentionally left uncommitted for the delivery harness.
