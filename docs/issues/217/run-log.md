# Issue #217 run log

- 2026-09-01: Issue #217 was OPEN and Project status Todo at kickoff. The
  configured GitHub write connector required unavailable approval; raw GraphQL
  mutations returned an opaque `UNKNOWN` error.
- 2026-09-01: `pull` skill was not available. The documented fallback
  `git fetch origin main && git merge --ff-only origin/main` could not write
  `.git/FETCH_HEAD` because the provided worktree exposes `.git` read-only.
  HEAD remains `a21a7df`.
- 2026-09-01: Reproduction/evidence review confirmed the research's five
  explicit unknowns and that the current tree has MCP approval-domain types and
  UI only; PR #415 is the transport/application seam.
- 2026-09-01: Added ADR 0040, ADR index entry, and this issue plan/handoff.
