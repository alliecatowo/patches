# Handoff — issue #435

Implemented the config-gated split-origin passkey fix. `PASSKEY_RP_ID` and `PASSKEY_ORIGINS`
are validated, default through `AppConfigService` to the prior `PUBLIC_ORIGIN` behavior, and
are used by both registration and login verification. Production Fly settings target
`patches-web.pages.dev`; ADR 0022 and deployment docs explain RP-ID re-enrollment.

Retry #2 found no delivery or implementation failure to correct: the persisted evidence only says
the worker was interrupted while delivery ran. PR #450 is open and mergeable; its one automation
comment reports no findings, with no reviews or inline threads. `git diff --check` passed again.
Focused accessor and schema tests could not run because this worktree has no local dependency
binaries; `mise run check packages/config` is blocked by the read-only managed workspace trust/state
path. No commit, push, PR, merge, CI, deployment, or remote polling was performed; delivery remains
with the harness.

Workspace handoff is ready: changes remain uncommitted on the provided branch, the persistent GitHub
workpad was updated in place, and the local `plan.md`, `run-log.md`, and this handoff contain retry
evidence.
