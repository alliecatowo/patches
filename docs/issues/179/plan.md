# Issue #179 plan

Retry attempt #2: diagnose the persisted delivery quality failure without expanding the
approved documentation-only slice. The GitHub workpad remains the single remote source
of truth; these required repository artifacts retain the local evidence.

## Scope

Draft and index the proposed ADR for an ephemeral `Now` status. This slice is
documentation-only and must not implement the dependent server or TUI issues (#180 and
#181).

## Checklist

- [x] Review the authoritative vision, ADR template, and existing interaction/moderation constraints.
- [x] Define lifecycle, expiry, visibility, privacy, moderation, audit, and client-rendering invariants.
- [x] Define the owner-approval gate and the exact handoff boundary for #180 and #181.
- [x] Add and index ADR 0040.
- [x] Run documentation-focused validation.
- [x] Reproduce and correct the persisted quality-check signal.
- [x] Record evidence and handoff without committing or publishing.

## Acceptance criteria

- ADR is explicitly Proposed and blocks implementation pending owner approval.
- Now is non-story, node-local, bounded, and absent from timelines and ranking inputs.
- Deletion, expiry, audience privacy, moderation/audit, and client behavior are explicit.
- Follow-on contract surfaces are named without adding code.
- The retry leaves no whitespace errors in the delivered documentation diff.
