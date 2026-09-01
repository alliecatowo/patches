# Issue #217 — MCP-01 product/security scope

```text
pink-allie-cat:/home/allie/develop/patches/.polyphony/workspaces/_217@a21a7df
```

## Objective

Convert the verified MCP 2026-07-28 research into an owner-decision-ready scope
that constrains the transport/application seams from PR #415.

## Plan

- [x] Reconcile the research, existing MCP approval seam, and PR #415 context.
- [x] Decide the v0 resource URI, authentication boundary, scopes, and tool set.
- [x] Document the threat model, operational limits, and explicit deferrals.
- [x] Record architectural choices in ADR 0040 and update the ADR index.
- [x] Record run evidence and handoff under this issue directory.

## Acceptance criteria

- [x] Scope names a canonical resource URI and separate MCP audience/scopes.
- [x] v0 tool inventory is deterministic, authorization-filtered, and read-only.
- [x] Token confusion, asserted-but-unverifiable auth, Origin/CSRF, model-visible
  data, replay/rate limits, and multi-replica behavior are addressed.
- [x] CIMD/DCR, DPoP, mutations, subscriptions, and DMs have explicit gates.
- [x] Research facts and product decisions are distinguishable and traceable.

## Validation plan

- [x] Inspect ADR links and repository policy constraints.
- [x] Run markdown formatting/lint checks available in the repository.
- [x] Verify the decision does not authorize a forbidden timeline sort/rank,
  plaintext DM access, or a client-controlled authorization shortcut.

## Notes

- GitHub issue/project writes were attempted through the configured connector,
  raw GraphQL, and `gh`; all were blocked by unavailable approval, an opaque
  GraphQL `UNKNOWN`, invalid GitHub CLI auth, or unavailable network.
- The `pull` skill is not installed. Its documented git fallback could not
  write `.git/FETCH_HEAD` because the provided worktree exposes `.git` read-only;
  no code edits were made before this check and HEAD remains `a21a7df`.
