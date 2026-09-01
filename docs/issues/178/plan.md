# Issue #178 plan

## Scope

Resolve the conflicting DM privacy policy and update the three consent surfaces only after the owner-approved wording and the coordinated `§183.1` amendments exist.

## Checklist

- [ ] Confirm the owner-approved statement for `E2EE_V1_ENABLED=false` (blocked on open #150/B-125 and #198).
- [ ] Reconcile `INITIAL_VISION.md §183.1` and `CLAUDE.md` with ADR 0030/0039 and B-125 (blocked on owner amendment).
- [ ] Update web registration, web privacy settings, and mobile registration copy together.
- [x] Verify current surfaces and identify the unsafe mismatch without changing copy.
- [ ] Run targeted checks and record results.

## Current disposition

Blocked: the repository contains contradictory normative instructions. ADR 0039 retires the server-visible-DM disclaimer and requires capability-based limitation copy, while `INITIAL_VISION.md §183.1` still mandates server-visible wording. `E2EE_V1_ENABLED` defaults to `false`; changing copy now would require choosing between conflicting owner policy and could make an unsupported security claim.
