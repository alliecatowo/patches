# Issue #159 run log

- 2026-08-29: Checkout is clean at `f500cfdd` (`origin/main`). No MCP files exist on this base branch; existing PR #415 contains the candidate MCP transport/docs slice on `origin/agent/wt-mcp-foundation-b220`.
- 2026-08-29: `gh` CLI authentication is invalid; GitHub GraphQL remains available for issue metadata and workpad updates.
- 2026-08-29: Reviewed PR #415's committed MCP docs/test source. Transport tests cover Origin, Host, body budget, method rejection, deadline, and malformed input. The requested OAuth/approval, SSRF, replay, subscription isolation, sensitive-output, audit-provenance, protocol-mismatch, and independent-client evidence is not present.
- 2026-08-29: Applying the source diff failed because this checkout has no target application files. Cherry-pick also failed because `.git/sequencer` cannot be created (`Read-only file system`).
- 2026-08-29: `mise run check server` failed before package checks: the sparse checkout has no package tree and the harness reports `spawnSync /bin/sh EPERM`.
- 2026-08-29: Commit attempt failed because `/home/allie/develop/patches/.git/index.lock` cannot be created (`Read-only file system`).
- 2026-08-30: Reconciled the verification record against PR #415's reported head `26b2a06`; added explicit distinction between deadline handling and client cancellation, protocol-version gap, and concrete pre-rollout obligations for every requested category.
- 2026-08-30: No source or test claims were added locally because this checkout still contains only the documentation workpad paths; no independent MCP client or deployment secret is available to exercise.
