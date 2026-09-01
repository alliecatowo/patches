# Issue #160 handoff

## Completed local slice

- Added [ADR 0040](../../decisions/0040-canonical-federation-origin.md), selecting
  `https://patches.social` as the permanent canonical federation origin with no federation
  subdomain split, based on accepted ADR 0013.
- Updated production Fly `PUBLIC_ORIGIN`/`NODE_DOMAIN`, preview documentation, deployment
  runbook, privacy hostname, and roadmap evidence.
- Classified identifiers minted under `patches-social.fly.dev` as pre-alpha throwaway data
  under ADR 0030; no migration or alias is planned.

## External blocker

DNS and Fly certificate issuance/TLS verification could not be completed in this runner:
`flyctl` cannot write its config directory, DNS socket creation is denied, and both HTTPS
probes fail with host resolution errors. The production-domain checklist therefore remains
open, and federation remains disabled.

## Repository state

- No commit or PR was created; the harness owns delivery.
- Evidence is in [run-log.md](./run-log.md) and the single GitHub `## Codex Workpad` comment.

## Retry validation

- Corrected the Prettier failure in `docs/decisions/README.md`.
- Affected Markdown passes Prettier; `git diff --check` and both Fly TOML parses pass.
- The external DNS/Fly certificate blocker is unchanged.

## Merge-conflict correction

- PR #438 conflicts because `main` independently assigned ADR 0039 to the E2EE-only DM
  decision. The canonical-origin decision is now [ADR 0040](../../decisions/0040-canonical-federation-origin.md),
  with every related documentation reference updated. This preserves both decisions and
  removes the conflicting filename/index assignment for the harness rebase.

## Continuation attempt 3

- Preserved and locally revalidated the ADR 0040 rename after delivery was interrupted.
- Clarified that `social.patches.social` is reserved, not an alternate federation identifier
  origin, so the deployment routing diagram matches the no-subdomain-split decision.
- `pnpm exec prettier` is unavailable in this restricted checkout (read-only `mise` trust
  state and no workspace binary); TOML parsing, ADR-reference integrity, and `git diff --check`
  pass. The harness quality gate remains the Markdown-format authority.
- The external DNS/Fly certificate/TLS blocker remains unchanged; no remote delivery action
  was taken.

## Continuation attempt 4

- Preserved the already validated canonical-origin slice at `HEAD` (`51b936e`); no implementation
  edits were required in this retry.
- Revalidated TOML parsing, ADR-reference integrity, and `git diff --check`.
- GitHub workpad synchronization was rejected by the connector's approval guard, and no repository
  fallback updater is present. The local run log records this attempt.
- DNS/Fly certificate issuance and live TLS verification remain blocked by the runner environment;
  delivery remains harness-owned.

## Continuation attempt 5

- Refreshed the single GitHub workpad successfully and preserved the validated implementation at
  `HEAD` (`51b936e`).
- Revalidated TOML parsing, ADR-reference integrity, and `git diff --check` successfully.
- DNS/Fly certificate issuance and live TLS verification remain blocked; no delivery or CI polling
  was performed because those operations are harness-owned or externally unavailable.

## Continuation attempt 6

- Preserved the validated canonical-origin slice at `HEAD` (`51b936e`); no implementation edits
  were required.
- Focused Fly TOML, ADR-reference, roadmap-evidence, and whitespace checks passed.
- DNS/Fly certificate issuance and live TLS verification remain blocked by the runner environment;
  no delivery or CI polling was performed because those operations are harness-owned.

## Continuation attempt 7: delivery correction

- Confirmed the merge-conflict correction remains valid: the local branch adds ADR 0040 and does
  not collide with the E2EE ADR 0039 in the current mainline history.
- Removed trailing whitespace from ADR 0040's status/date lines after `git diff --check
  origin/main...HEAD` exposed it. `git diff --check origin/main` and the focused Fly
  TOML/ADR-reference/roadmap-evidence validation pass for the corrected workspace.
- Prettier cannot run locally because this workspace has no executable binary; the harness quality
  gate remains the formatter authority.
- DNS/Fly certificate issuance and live TLS verification remain blocked by the runner environment;
  no delivery or CI polling was performed.
