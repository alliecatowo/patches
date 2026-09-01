# Issue #221 — Implement MCP tool catalog

## Scope

Issue #221 is B-075 and explicitly depends on B-069 (issue #217). The catalog
cannot safely be implemented until B-069 approves the MCP audience/issuer,
resource URI, scope taxonomy, minimal tool set, and threat model.

## Plan

1. Reconcile the live issue, prerequisite, workpad, and repository state.
2. Reproduce the current missing-contract signal and inspect existing MCP code.
3. Implement only after the B-069 contract exists; do not invent security or
   product requirements.
4. Record the evidence-backed blocker for the harness.

## Result

Retry #1 is blocked before code edits. Issue #217 remains OPEN and its current
decision comment says the MCP contract is still undecided. Repository search at
`origin/main` contains MCP approval UI/domain types and research, but no MCP
transport or tool catalog. The project has no `Human Review` status option, so
the item remains `In Progress` with its existing blocked label.
