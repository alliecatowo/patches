# Issue #179 handoff

## Completed

- Retry attempt #2 diagnosed the persisted delivery quality failure. No new
  implementation scope was introduced.
- Drafted and indexed [ADR 0040](../../decisions/0040-ephemeral-now-status.md).
- Specified the proposed non-story contract: one replaceable status, 24-hour maximum
  expiry, explicit public/follower audience, node-local handling, absence-equivalent
  privacy behavior, deletion/expiry, moderation/audit limits, and client copy/rendering.
- Added the required issue artifacts under `docs/issues/179/`.
- Updated the single GitHub workpad comment and moved the project item to `In Progress`.

## Validation

- `git diff --check 0ed916d..HEAD`, `git show --check HEAD`, and the current-worktree
  `git diff --check` passed.
- The prior quality failure was reproduced: trailing whitespace on the ADR `Status` and
  `Date` lines. Those Markdown hard-break spaces were removed.
- ADR/index headings and relative links were checked with repository searches.
- Required artifact and constraint-marker checks passed.
- `pnpm exec prettier --check ...` could not start because mise rejected the untrusted
  workspace; no local Prettier or markdownlint binary was available.
- No code or generated artifacts were changed.
- PR #456 feedback sweep found no actionable review or inline comments.

## Blocker

The ADR remains Proposed by design. Owner approval of the exact constraints is required
before #180 or #181 implements any Now protocol, storage, or UI behavior. Direct
Prettier execution is externally blocked: mise refuses the untrusted workspace config,
and trusting it would write outside the allowed repository copy. Commit, push, PR
creation, and issue delivery remain with the orchestration harness.
