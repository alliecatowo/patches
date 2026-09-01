# Issue #151 plan

## Scope

Reopen ADR 0032 with a design-only ADR for authenticated Connect server-streaming
invalidation, retaining unary polling as the mandatory fallback.

## Work items

- [x] Reconcile issue state, workpad, ADR 0032, research, and linked PR.
- [x] Add ADR 0039 with the RPC shape and explicit non-goals.
- [x] Document fallback, authorization, backpressure, reconnect, resource bounds,
  cross-node fan-out, and reversible rollout.
- [x] Mark ADR 0032 superseded and update the ADR index.
- [x] Record validation and handoff evidence.

## Boundaries

This slice adds documentation only. It does not edit protobuf, server/client code,
database migrations, feature flags, or deployment configuration.

## Retry attempt #3

- [x] Confirm the previous delivery interruption did not leave an incomplete local slice.
- [x] Reconcile the active workpad and preserve the published focused change for the
  delivery harness.

## Retry attempt #1 (continuation)

- [x] Reconcile current `a2618ab` workspace state and the existing ADR 0039 slice.
- [x] Re-run focused documentation and artifact validation.
- [x] Record the unavailable workpad-comment mutation path and return control to the
  delivery harness without remote waiting.
