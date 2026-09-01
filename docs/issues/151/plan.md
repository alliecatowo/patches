# Issue #151 plan

## Scope

Reopen ADR 0032 with a design-only ADR for authenticated Connect server-streaming
invalidation, retaining unary polling as the mandatory fallback.

## Work items

- [x] Reconcile issue state, workpad, ADR 0032, research, and linked PR.
- [x] Add ADR 0040 with the RPC shape and explicit non-goals.
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

- [x] Reconcile current `8959dad` workspace state and the existing streaming ADR slice.
- [x] Re-run focused documentation and artifact validation.
- [x] Record the unavailable workpad-comment mutation path and return control to the
  delivery harness without remote waiting.

## Current continuation

- [x] Reconcile the existing streaming ADR slice and preserve the harness-owned
  `docs/issues/_151/run-log.md` modification.
- [x] Re-run focused documentation, reference, artifact, and whitespace checks.
- [x] Return the validated workspace to the delivery harness without delivery
  operations or remote waiting.

## Retry attempt #1 (current run)

- [x] Reconcile the active issue/workpad and current `12d72dd` checkout.
- [x] Re-run focused ADR content, reference, artifact, and whitespace checks.
- [x] Preserve the harness-owned `docs/issues/_151/run-log.md` change and stop after
  local validation.

## Retry attempt #6 (merge-conflict continuation)

- [x] Inspect PR #440's current head, merge state, and all review-feedback channels.
- [x] Reconcile the remote `main` SHA with this checkout's stale tracking ref.
- [x] Attempt the mandated safe sync, preserve unrelated work, and record the
  Git-metadata access restriction for the delivery harness.

## Retry attempt #1 (current continuation)

- [x] Reconcile the active issue/workpad and confirm the existing streaming ADR slice is intact.
- [x] Preserve the harness-owned `docs/issues/_151/run-log.md` modification.
- [x] Re-run focused documentation, reference, artifact, and whitespace checks.
- [x] Return the validated workspace to the delivery harness without delivery operations or remote waiting.

## Retry attempt #1 (current handoff)

- [x] Reconcile PR #440 feedback and confirm its current open/conflicting state.
- [x] Update the persistent workpad with the current workspace stamp and evidence.
- [x] Re-run focused documentation, reference, artifact, and whitespace checks.
- [x] Preserve the harness-owned `docs/issues/_151/run-log.md` modification and return control without delivery or remote waiting.

## Retry attempt #1 (final local validation)

- [x] Reconcile the intact streaming ADR design slice and existing workpad.
- [x] Re-run focused content, reference, artifact, and whitespace validation.
- [x] Preserve harness-owned changes and return control without delivery or remote waiting.

## Retry attempt #1 (current handoff)

```text
pink-allie-cat:/home/allie/develop/patches/.polyphony/workspaces/_151@e0cf048
```

- [x] Reconcile the active issue/workpad and confirm the existing streaming ADR slice is intact.
- [x] Run focused stream-design, fallback, authorization, flow-control, reconnect,
  bounds, rollout, exclusion, reference, artifact, and whitespace checks.
- [x] Preserve the harness-owned `docs/issues/_151/run-log.md` modification.
- [x] Return control without commit, push, PR, merge, CI wait, or remote-delivery operations.

## Retry attempt #3 (ADR-number conflict resolution)

```text
pink-allie-cat:/home/allie/develop/patches/.polyphony/workspaces/_151@e0cf048
```

- [x] Reconcile issue #151, the persistent workpad, PR #440, and remote `main` once.
- [x] Reproduce the merge conflict as ADR number 0039 being allocated independently on `main`.
- [x] Restore main's exact E2EE ADR 0039, renumber the realtime invalidation design to ADR 0040,
  and merge the ADR index entries.
- [x] Re-run focused content, reference, artifact, and whitespace validation.
- [x] Update the local handoff and persistent workpad.
- [x] Return control without retrying or polling remote systems.
