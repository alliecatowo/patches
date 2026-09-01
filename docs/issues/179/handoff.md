# Issue #179 handoff

## Completed

- Retry attempt #1 revalidated the carried-forward documentation slice in the provided
  workspace. No new implementation scope was introduced.
- Drafted and indexed [ADR 0040](../../decisions/0040-ephemeral-now-status.md).
- Specified the proposed non-story contract: one replaceable status, 24-hour maximum
  expiry, explicit public/follower audience, node-local handling, absence-equivalent
  privacy behavior, deletion/expiry, moderation/audit limits, and client copy/rendering.
- Added the required issue artifacts under `docs/issues/179/`.
- Updated the single GitHub workpad comment and moved the project item to `In Progress`.

## Validation

- `git diff --check` passed.
- ADR/index headings and relative links were checked with repository searches.
- Required artifact and constraint-marker checks passed.
- `pnpm exec prettier --check ...` could not start because mise rejected the untrusted
  workspace; no local Prettier or markdownlint binary was available.
- No code or generated artifacts were changed.

## Blocker

The ADR remains Proposed by design. Owner approval of the exact constraints is required
before #180 or #181 implements any Now protocol, storage, or UI behavior. Commit, push,
PR creation, and issue delivery are intentionally left to the orchestration harness.
The remote workpad could not be updated this retry: GitHub GraphQL mutation failed and
the `gh api` fallback could not connect to api.github.com.
