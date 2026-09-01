# Handoff — issue #435

Implemented the config-gated split-origin passkey fix. `PASSKEY_RP_ID` and `PASSKEY_ORIGINS`
are validated, default through `AppConfigService` to the prior `PUBLIC_ORIGIN` behavior, and
are used by both registration and login verification. Production Fly settings target
`patches-web.pages.dev`; ADR 0022 and deployment docs explain RP-ID re-enrollment.

Validation: deterministic source audit and `git diff --check` passed. Focused accessor and schema
tests were added, but could not run because the workspace has no local Vitest/TypeScript binaries
and mise stops at the managed workspace trust/state restriction. No commit, push, PR, merge, CI,
or deployment polling was performed; delivery remains with the harness.

Workspace handoff is ready: changes remain uncommitted on the provided branch, and the persistent
GitHub workpad was updated in place.
