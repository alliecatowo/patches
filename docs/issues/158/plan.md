# Issue #158 — audit plan

## Scope

Audit the committed authentication contract and actual web, TUI, and mobile client surfaces for
registration, privacy acknowledgement, verification/resend, login, refresh/reuse recovery,
logout/all-sessions, password reset, SSH, passkey, GitHub/OIDC, credential/device management, and
closed-node behavior. Record intentional N/A cells and runtime-validation blockers without changing
authentication invariants.

## Completed work

- [x] Reconcile issue #158, the single existing workpad, and attached PR #424.
- [x] Review `docs/architecture/auth.md` and the web/TUI/mobile source surfaces.
- [x] Reproduce the current validation boundary: preview advertised, but browser permission denied;
      real email disabled and no test credentials supplied.
- [x] Record the existing web per-RPC auth-interceptor correction and the remaining mobile/policy
      gaps as scoped findings.
- [x] Add and synchronize `audit.md`, `plan.md`, `run-log.md`, and `handoff.md` under the issue
      artifact directory.

## Acceptance criteria

- [x] All requested authentication flow categories are inventoried for web, TUI, and mobile.
- [x] Intentional platform limitations are separated from parity and policy gaps.
- [x] Uniform errors, rate limits, token rotation/storage, proof-of-possession, and capability
      policy are explicitly preserved.
- [x] A client-visible end-to-end acceptance path is written, including closed-node and
      `PASSWORD_AUTH=off` behavior.
- [x] Runtime claims are limited to observed evidence; blocked flows are named precisely.

## Validation plan

- [x] Read the authoritative auth architecture and inspect actual client source paths.
- [x] Confirm mobile exists and audit its registration/login/device-link/session/storage behavior.
- [ ] Run `mise run check mobile`; environment trust setup is blocked by read-only filesystem.
- [x] Run documentation whitespace validation and review artifact consistency.
- [ ] Exercise a disposable node with credentials and email delivery; blocked by preview access,
      disabled email, and absent test credentials.
