# Issue #217 handoff

Task: #217
Status: partial
Summary: ADR 0040 records the read-only MCP-01 scope; retry #2 reconciled all per-issue artifacts to `docs/issues/217/`.
Files: `docs/decisions/0040-mcp-01-product-security-scope.md`, `docs/decisions/README.md`, `docs/issues/217/{plan,run-log,handoff}.md`; deleted `docs/issues/_217/run-log.md`.
Tests: `git diff --check`: PASS; targeted decision-policy scan: PASS; `mise`/pinned Prettier: BLOCKED by untrusted workspace configuration.
Findings: v0 is one scoped, deterministic `server.info` tool; DMs, mutations, DPoP, CIMD/DCR, and subscriptions remain explicitly gated.
Follow-ups: none.
Unresolved: Remote GitHub workpad/status could not be reconciled: GraphQL returned `UNKNOWN`; `gh` could not reach `api.github.com`. Pull is unavailable because the skill is absent and `.git/FETCH_HEAD` is read-only.
Blocker class: env
Confidence: high
Next: harness delivery/validation retry.
