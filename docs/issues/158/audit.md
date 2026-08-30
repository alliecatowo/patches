# Cross-client authentication UX/security audit

## Result

The committed authentication contract covers the requested flows for the web and terminal
clients. The evidence is documentation-level, not a live-node exercise: this retry workspace
does not contain the application checkout, and no disposable-node credentials/configuration are
available.

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
3. **Intentional limitations.** Browser SSH private-key use and TUI passkey use are N/A by
   design, not defects. The documented closed-node behavior is also a capability policy, not a
   client-side bypass opportunity.

## Validation boundary

Validated by reading `HEAD:docs/architecture/auth.md` and checking the checkout contents and
commit identity. Live disposable-node flows, app launch checks, and package tests remain
unexecuted because their required source/configuration is unavailable.
