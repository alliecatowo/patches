# Cross-client authentication UX/security audit

## Result

The committed authentication contract covers the requested flows for the web and terminal
clients. The PR preview automation now reports a live disposable stack, but this retry workspace
could not complete a live-node exercise: browser permission was denied before the preview loaded,
and no disposable-node credentials or email delivery are available.

## Inventory

| Area | Web | TUI | Finding |
| --- | --- | --- | --- |
| Registration/privacy acknowledgement | Yes | Yes | Registration acknowledges the privacy notice; password fields follow node policy. |
| Verification/resend | Yes | Contracted | Resend is authenticated and deliberately has no email field, preserving no-enumeration. |
| Password/recovery login | Yes | Yes | Shared session envelope; failures remain uniform. |
| Refresh/reuse recovery | Yes | Contracted | Opaque refresh tokens are hashed, rotated, and family-revoked on reuse. |
| Logout/all sessions | Yes | Contracted | Local cleanup occurs even if logout transport fails; all-sessions revokes the current browser too. |
| Password reset | Yes | Contracted | Verified recovery email is required; acknowledgement is uniform and secrets stay out of URLs/logs. |
| SSH | N/A for browser private-key use | Yes | SSH-agent signing and server-verified enrollment are intentional terminal-only behavior. |
| Passkey | Yes | N/A | Web-only is an architectural limitation: TUI has no browser WebAuthn relying party. |
| GitHub/OIDC | Configured path | Device flow path | Linking requires an authenticated Patches session; provider tokens are discarded. |
| Credential management | Yes | Yes | List/revoke parity is documented; add operations follow possession/capability constraints. |
| Closed node / password policy | Yes | Yes | Closed or password-disabled nodes hide password UI and explain the supported path. |
| Mobile client | No checked-out client | No checked-out client | No mobile source or manifest is present in this checkout; no mobile behavior is claimed. |

## Security conclusions

- The contract keeps method-specific authentication behind one session boundary, so clients do
  not receive a weaker token or storage policy based on the login method.
- SSH enrollment requires server-verified proof of possession; private keys never enter Patches.
- Login, registration, reset, verification, and challenge issuance are documented as both
  process-local and database-backed rate-limited where required.
- The architecture explicitly requires generic authentication failures and does not expose DM
  bodies or credential secrets through logs, responses, or durable jobs.

## Findings and blockers

1. **Actionable product gap — `PASSWORD_AUTH=required`.** The committed contract says
   `required` is published but does not yet reject passwordless registration. This needs a
   separately scoped server/client implementation and tests; this checkout cannot safely make
   that code change because application files are not checked out.
2. **External blocker — production GitHub/OIDC exercise.** The committed contract records
   `GITHUB_CLIENT_ID` as unset on the production node. Live login/linking cannot be claimed
   until the OAuth app and node secrets exist.
3. **External validation blocker — preview access.** The PR preview comment reports live gRPC,
   HTTP, web, worker, and database components, but browser access was denied before navigation,
   so no runtime UI behavior or authentication request can be claimed. Real email is disabled
   and no test credentials are supplied.
4. **Intentional limitations.** Browser SSH private-key use and TUI passkey use are N/A by
   design, not defects. The documented closed-node behavior is also a capability policy, not a
   client-side bypass opportunity.

## Validation boundary

Validated by reading `docs/architecture/auth.md`, checking the checkout contents and commit
identity, and reviewing the PR preview capability report. Live disposable-node flows and app
launch checks remain unexecuted because browser access was denied before navigation; package
tests remain unavailable because the application source/configuration is not checked out.

## End-to-end acceptance path

For a configured node, the supported client path is: open registration, acknowledge the privacy
notice, submit credentials, follow the generic verification result, sign in, refresh once, sign
out locally, then use the all-sessions action and confirm the current session is rejected. A
password-disabled or closed node must instead show the supported non-password method without
revealing node state through a method-specific authentication error. This path is a validation
requirement, not a result claimed from this sparse checkout.
