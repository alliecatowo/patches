# Issue #151 handoff

## Completed

- Added `docs/decisions/0039-realtime-invalidation-stream.md`.
- Marked ADR 0032 superseded by ADR 0039 and indexed the new ADR.
- Documented one server-streaming `SubscribeSignals` invalidation RPC, unary
  fallback for SSH/restrictive proxies, authz, resume tokens, heartbeat,
  backpressure, reconnect, per-node limits, no-bus cross-machine fan-out,
  feature-gated rollback, and all requested exclusions.
- Added the required per-issue plan and run log.

## Validation

- `git merge --ff-only origin/main` attempted; blocked by read-only Git metadata
  (`.git/ORIG_HEAD.lock`).
- Focused repository checks completed after edits (see final run log).

## Harness handoff

Workspace changes are intentionally uncommitted and unpushed for the delivery
harness. No CI or remote review was polled.
