# Issue #388 plan

1. Reproduce the sibling worktree bootstrap/access mismatch.
2. Default both WorktreeCreate hooks to the ignored, repo-local `.worktrees/` root while retaining `PATCHES_WORKTREE_ROOT` overrides.
3. Document the sandbox-accessible path contract and run focused hook checks.

Acceptance: default provisioned worktrees remain inside the worker allow-list, explicit overrides still work, and both hooks plus documentation agree.
