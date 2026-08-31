# Issue #160 handoff

## Completed local slice

- Added [ADR 0039](../../decisions/0039-canonical-federation-origin.md), selecting
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
