# Issue #158 — authentication UX/security audit

## Scope

Audit the committed cross-client authentication contract and record supported flows,
intentional platform limitations, and verified blockers. No application source is present in
this retry checkout, so implementation changes are limited to issue evidence.

## Acceptance criteria

- [x] Inventory registration, privacy acknowledgement, verification/resend, login, refresh and
      reuse recovery, logout/all-sessions, reset, SSH, passkey, GitHub/OIDC, and credential
      management across web and TUI.
- [x] Record closed-node and `PASSWORD_AUTH` behavior and distinguish architectural N/A cells.
- [x] Preserve uniform errors, rate limits, token rotation/storage, proof-of-possession, and
      capability policy in the audit conclusions.
- [x] Record external blockers and actionable follow-up items without claiming live validation.

## Validation plan

- [x] Read the committed authentication architecture and route/client contract from Git.
- [x] Confirm the current checkout, commit, and absence of application source files.
- [ ] Live disposable-node exercise: blocked by unavailable node credentials/configuration.
- [ ] Full package checks: blocked because this checkout has no package manifests/source tree.
- [ ] Commit/PR publication: blocked after both the shared index and isolated temporary-index
      commit paths hit the read-only filesystem; GitHub connector writes require unavailable
      approval.
