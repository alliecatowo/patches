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
- [ ] Re-run the pinned Prettier Markdown check for the retry #2 workpad
      correction (blocked: mise rejects the untrusted workspace configuration,
      `pnpm` resolves through mise, and no local Prettier binary is present).
- [x] Verify the decision does not authorize a forbidden timeline sort/rank,
      plaintext DM access, or a client-controlled authorization shortcut.

## Notes

- GitHub issue/project writes were attempted through the configured connector,
  raw GraphQL, and `gh`. On retry #2, GraphQL returned an opaque `UNKNOWN`
  error and `gh` could not reach `api.github.com`; no remote state was changed.
- The `pull` skill is not installed. Its documented git fallback could not
  write `.git/FETCH_HEAD` because the provided worktree exposes `.git` read-only;
  no code edits were made before this check and HEAD remains `a21a7df`.
- 2026-09-01 retry: pinned Prettier reproduced the quality failure in ADR 0040,
  the ADR index, and this plan; formatting was applied and the full repository
  format check now passes. Direct lint was blocked by the pnpm store database
  (`unable to open database file`).
- 2026-09-01 retry #2: reconciled the run log to the required
  `docs/issues/217/` convention. `git diff --check` and the decision-policy scan
  pass; the pinned formatter cannot be re-run in this managed worktree because
  mise rejects the untrusted workspace configuration, `pnpm` resolves through
  mise, and no local Prettier binary is present.
