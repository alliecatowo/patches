# Issue #160 plan

## Scope

Resolve the permanent canonical federation origin before public federation is enabled.

## Intended work

1. Record the owner-selected domain and subdomain split from the accepted reference-node decision.
2. Configure production and document preview origins and domains.
3. Verify DNS, Fly certificates, and TLS.
4. Document treatment of identifiers minted under `patches-social.fly.dev`.
5. Mark the §159 and §160 roadmap gates with evidence, leaving externally unverified gates open.

## Current disposition

The repository's accepted ADR 0013 establishes `patches.social` as the flagship/reference
node. This run records that as the permanent canonical origin in ADR 0040, updates the
production configuration and roadmap evidence, and leaves DNS/Fly certificate proof as the
only external blocker.

## Retry disposition (2026-08-31)

The prior delivery's quality check failed on Prettier formatting in the ADR index. The retry
formats that table entry and validates the affected Markdown plus the configuration parsing;
remote delivery remains harness-owned.

## Merge-conflict resolution (2026-09-01)

`main` independently added ADR 0039 for the E2EE-only DM decision. This issue's canonical-
origin ADR is therefore renumbered to ADR 0040, preserving both accepted decisions and
removing the filename/index conflict before the harness rebases the delivery branch.

## Continuation attempt 3 (2026-08-31)

The delivery harness was interrupted while publishing the already validated correction. This
run preserves that correction, verifies the ADR 0040 rename and its documentation references,
and returns the workspace to the harness without remote delivery or polling.

## Continuation attempt 4 (2026-09-01)

The preserved implementation remains locally complete at `HEAD` (`51b936e`), so this retry only
reconciles the workpad evidence and reruns narrow integrity checks. The GitHub comment update was
rejected by the connector's approval guard and no local fallback updater exists. DNS, certificate,
TLS, and delivery operations remain outside this worker's available access and ownership.

## Continuation attempt 5 (2026-09-01)

The persistent GitHub workpad was successfully refreshed. The implementation remains complete at
`HEAD` (`51b936e`); TOML parsing, ADR-reference integrity, and `git diff --check` all pass again.
No deployment, DNS/TLS probe, delivery, or CI polling was performed.

## Continuation attempt 6 (2026-08-31)

The canonical-origin implementation remains complete at `HEAD` (`51b936e`). This retry reruns
the focused configuration, ADR-reference, roadmap-evidence, and whitespace checks, then returns
control to the delivery harness. DNS/Fly certificate/TLS proof remains externally unavailable.

## Continuation attempt 7 (2026-09-01)

The persisted `merge_conflict` evidence was traced to the prior ADR-number collision already
resolved by the ADR 0040 rename. Focused revalidation additionally found trailing whitespace in
ADR 0040 that made `git diff --check origin/main...HEAD` fail; this run removes it before
returning the corrected delivery slice to the harness.
