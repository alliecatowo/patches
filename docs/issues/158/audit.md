# Issue #158 — cross-client authentication UX/security audit

## Result

The server contract and the three checked-in clients cover the core authentication boundary, but
they do not have feature parity. Web and TUI expose the broadest account-management surfaces;
mobile has registration, password/device-flow login, secure token persistence, and local sign-out,
but no verification/reset/credential-management/session-security screens. This is a source audit,
not a claim of successful live-node execution: the advertised PR preview has no real email or test
credentials, and browser access was denied before navigation.

## Inventory

| Flow                                   | Web                                                    | TUI                                                      | Mobile                                         | Finding                                                                                                                |
| -------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Registration + privacy acknowledgement | `RegisterRoute`                                        | `patches register`                                       | `RegisterScreen`                               | All three gate submission on the notice acknowledgement; mobile also accepts an optional SSH public key.               |
| Login: password                        | `LoginRoute`                                           | `patches login --password`                               | `LoginScreen`                                  | Shared session envelope and uniform credential errors; password UI follows `GetAuthPolicy` for `off`.                  |
| Login: recovery code                   | `LoginRoute`                                           | `patches login --recovery`                               | Not exposed                                    | Mobile’s login screen has no recovery-code input; this is a parity gap to scope, not a reason to weaken server policy. |
| Email verification + resend            | `/verify-email`                                        | `patches verify <code>` / `--resend` and Accounts screen | Not exposed                                    | Web/TUI resend is authenticated and has no email field, preserving no-enumeration.                                     |
| Refresh + reuse recovery               | Shared client/session manager                          | Shared client/session manager                            | `SessionManager` + SecureStore                 | Rotation/reuse behavior is centralized; mobile clears local state after failed restore.                                |
| Logout                                 | Local cleanup after server logout attempt              | `patches logout`                                         | Local `signOut` only                           | Mobile does not call server `Logout` from its shell, so server-side invalidation is not represented in the UI path.    |
| Logout all sessions                    | Session security settings                              | Contracted in auth/TUI account flow                      | Not exposed                                    | Web explains that the protocol cannot list individual sessions and revokes the current browser too.                    |
| Password reset                         | `/reset-password`                                      | Server contract; no matching TUI screen found            | Not exposed                                    | Reset needs a verified recovery email and intentionally returns uniform request acknowledgement.                       |
| SSH login/enrollment                   | Login via device link; no browser private-key handling | Agent challenge/login and possession-proved enrollment   | Device-link approval from a signed-in terminal | Browser/mobile raw private-key use is intentionally unsupported; private keys never enter Patches.                     |
| Passkey login/enrollment               | Login and credential settings                          | Not applicable                                           | Not exposed                                    | Web-only is intentional: the TUI has no WebAuthn relying party, and Expo’s v0 path is not verified.                    |
| GitHub/OIDC login                      | Device-flow buttons                                    | Device-flow login/linking                                | Device-flow login                              | Provider tokens are used once and discarded; linking requires an authenticated Patches session.                        |
| Credential list/add/revoke             | `/settings/credentials`                                | Accounts screen and CLI flows                            | Not exposed                                    | Web/TUI enforce the last-credential guard; mobile has no management surface.                                           |
| Closed node / `PASSWORD_AUTH`          | Policy-aware fields and copy                           | Policy-aware fields and copy                             | Hides password on `off`; device links remain   | `required` is published but not enforced for passwordless registration; this is a separate server/client gap.          |
| Token storage / node isolation         | Browser credential store                               | OS keyring, explicit guarded file fallback               | Expo SecureStore keyed by node base URL        | Tokens are not interchangeable across nodes; no plaintext token storage is introduced by this audit.                   |

## Security invariants reviewed

- Every successful method returns the same short-lived access-token plus opaque refresh-token
  envelope. Refresh tokens are stored hashed server-side, rotated on use, and family-revoked on
  reuse; clients clear stale local state when refresh recovery fails.
- Login, registration, reset, verification resend, and SSH challenge issuance use the documented
  process-local plus database-backed rate limits. No client gap should be fixed by bypassing those
  limits or by adding method-specific error detail.
- SSH enrollment requires server-verified proof of possession. Mobile registration may accept a
  pasted public key, but the app does not read or transmit a private key.
- Credential additions require an authenticated session; revoking the final active credential is
  refused. GitHub/OIDC identifiers are provider account identifiers, not Patches identities, and
  third-party access/refresh tokens are not persisted.
- v0 direct messages remain server-visible; mobile registration states this explicitly. No auth
  artifact calls them encrypted, secure, or private.

## Findings and disposition

1. **Scoped correction already represented by PR #424:** the web auth interceptor must decide
   anonymous-vs-authenticated behavior per RPC, not by skipping the whole `AuthService`; otherwise
   credential listing, revocation, passkey enrollment, and provider linking lose their bearer
   token. The documented fix preserves anonymous `Login`/`Register`/`RefreshSession` while
   attaching a valid token to authenticated AuthService calls.
2. **Mobile parity gap:** mobile lacks verification/resend, recovery-code login, password reset,
   credential management, and logout-all. Its local-only shell sign-out also does not visibly
   perform server logout. These are follow-up implementation slices; this audit does not invent a
   weaker mobile protocol or claim those flows work.
3. **Policy gap:** `PASSWORD_AUTH=required` is published but currently permits passwordless
   registration according to `docs/architecture/auth.md`; enforcement needs a separately scoped
   server/client change and tests.
4. **External validation blocker:** the PR preview reports live gRPC/HTTP/web/worker/Neon surfaces,
   but real email is disabled, no test credentials were supplied, and browser permission was
   rejected before navigation. Therefore no credentialed registration, verification, login,
   refresh, logout, reset, SSH, passkey, or provider flow is reported as runtime-proven.

## Intentional limitations

Browser SSH private-key use, TUI passkey use, and mobile raw SSH-agent login are architectural
N/A cells. Mobile uses the documented device-link route (`BeginDeviceLink`/`ApproveDeviceLink`)
for a terminal-assisted login. The absence of individual session listing is also a protocol
limitation; “sign out everywhere” must not imply device discovery.

## Acceptance path for a configured disposable node

For each client that exposes the flow: open registration, read and acknowledge the node privacy
notice, submit credentials, observe the generic result, complete verification, sign in, allow one
access-token refresh, sign out, then invoke all-sessions where available and confirm the old session
is rejected. Repeat with `PASSWORD_AUTH=off` and a closed node: password fields must be hidden and
the supported device/SSH/provider path must remain visible without revealing credential state.
For mobile specifically, include the terminal-assisted device-link path and confirm SecureStore
is keyed to the node origin. This is a required runtime test definition, not evidence claimed from
the blocked preview.

## Evidence sources

- `docs/architecture/auth.md` — server contract, client surfaces, rate limits, policy, and
  credential invariants.
- `apps/web/src/routes/` and `apps/web/src/components/` — web auth and session-security surfaces.
- `apps/tui/src/cli/`, `apps/tui/src/auth/`, and `apps/tui/src/screens/AccountsScreen.tsx` — TUI
  auth, verification, SSH, and credential flows.
- `apps/mobile/src/screens/`, `apps/mobile/src/api/session.ts`, and
  `apps/mobile/src/api/credentialStore.ts` — mobile auth/device-link/session/storage behavior.
- PR #424 preview comment — live preview inventory, real-email-off boundary, and no supplied
  credentials; browser launch attempt — permission denied before navigation.
