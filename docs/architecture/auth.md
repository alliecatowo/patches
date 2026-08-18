# Authentication

How a person proves they are a user of a Patches node, and how the client holds sessions for
several nodes at once. Source of truth: `INITIAL_VISION.md` §33–§39 as amended by
**§165–§169**, plus ADR [0011](../decisions/0011-credentials-separate-from-identity.md) and
ADR [0010](../decisions/0010-argon2id-jose-jwt.md).

**Status: implemented.** All flows described below are implemented in
`apps/server/src/modules/auth/` and covered by integration tests: registration, email
verification, password login, refresh-token rotation with reuse detection, logout and
logout-all, password reset, SSH-key challenge/response login, GitHub OAuth device-flow
login, and credential list/add/revoke (including server-verified SSH enrollment proof), plus
DB-backed and peer rate limiting on the auth surface and bootstrap (first-user) registration.
Where a flow depends on an external protocol, the citation and verification date are given
inline.

## 1. The core split

A **credential** is a way to prove you are a user. It is not who you are.

```text
actors        social identity      (@handle, display name, bio, nameplate, page)
  ^ 1:1
users         local account        (status, optional recovery email)
  ^ 1:N
credentials   ways to authenticate (PASSWORD | SSH_PUBLIC_KEY | GITHUB)
```

Adding, rotating, or revoking a credential never changes the actor, the handle, or any social
relationship (§165). Schema detail is in [`data-model.md`](./data-model.md).

Invariants the service layer enforces:

- At most one active `PASSWORD` credential per user.
- One SSH key or GitHub account authenticates at most one user per node.
- Revoking the last active credential fails — an account always retains a way in.
- Adding a credential to an existing account requires an authenticated session.
- `secret_hash` is never logged, never returned over gRPC, and never present in a DTO.

## 2. Sessions (unchanged by Amendment A)

Every login method, on success, returns the **same session envelope**: a short-lived JWT
access token (§35, ~15 min, claims `sub`/`actor_id`/`session_id`/`iat`/`exp`) plus an opaque
high-entropy refresh token stored hashed and rotated on use, with reuse detection revoking
the token family (§36). Method-specific logic stops at the auth boundary; nothing downstream
knows or cares how the session was created.

## 3. Password login

Unchanged from §33–§34 except where the secret lives. Argon2id hashing (ADR 0010), parameters
benchmarked on deployment hardware.

1. Client sends handle-or-recovery-email + password to `Login`.
2. Server resolves the user (handle → actor → user, or normalized recovery email → user),
   loads that user's active `PASSWORD` credential, verifies the Argon2id hash.
3. Session envelope returned.

`credentials.identifier` is NULL for `PASSWORD` — the login key is resolved from `actors` /
`users`, so the recovery email is not duplicated into a second table (ADR 0011).

Password reset (`RequestPasswordReset` / `ResetPassword`) requires a **verified recovery
email**; an account without one has no reset channel by design and recovers by holding a
second credential.

## 4. SSH-key login

The terminal-native path: the key is already on the machine and the agent is already running.

### Verified basis

| Fact                                                                                                                                                                    | Source (verified 2026-08-17)                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| SSH agent protocol is RFC 9987, _Secure Shell (SSH) Agent Protocol_, Standards Track, May 2026                                                                          | https://www.rfc-editor.org/rfc/rfc9987.html |
| §5.6 `SSH_AGENTC_SIGN_REQUEST` carries `key blob`, `data`, `flags`; the agent signs **client-supplied arbitrary data** with a loaded identity and does not interpret it | RFC 9987 §5.6, §8.1                         |
| Signature flags `SSH_AGENT_RSA_SHA2_256 = 0x02`, `SSH_AGENT_RSA_SHA2_512 = 0x04` (for `ssh-rsa` keys only)                                                              | RFC 9987 §8.3                               |
| RFC 4252 §7 _publickey_ auth prepends the **session identifier** to the request fields inside the signed blob                                                           | https://www.rfc-editor.org/rfc/rfc4252.html |

Patches is not implementing SSH. It borrows RFC 4252's _binding discipline_ — bind the
signature to a specific server, session, and purpose so it cannot be replayed elsewhere.

### Flow

```text
client                                   node
  |  BeginSshLogin(candidate fps?, handle?) |
  |---------------------------------------->|  create ssh_login_challenges row
  |<----------------------------------------|  { challenge_id, nonce, expires_at }
  |
  |  SSH_AGENTC_SIGN_REQUEST(key, blob)     |   (to local ssh-agent, RFC 9987 §5.6)
  |
  |  CompleteSshLogin(challenge_id, fp, sig)|
  |---------------------------------------->|  verify sig over reconstructed blob
  |<----------------------------------------|  session envelope
```

The signed blob binds, in this fixed order (§166):

```text
"patches-ssh-login-v1"     domain separation; versioned, never reused
node canonical domain      stops replay against another node
challenge id
nonce                      >= 32 bytes, CSPRNG
credential fingerprint     SHA256:<base64>, OpenSSH form
expires_at
```

**Wire encoding.** Each field above is framed exactly as an SSH `string` (RFC 4251 §5: a
big-endian `uint32` byte count followed by that many bytes — the same primitive OpenSSH uses
for every field of a public key or signature blob), concatenated in the order shown, with no
separators or padding between fields:

```text
uint32  len("patches-ssh-login-v1")     "patches-ssh-login-v1"
uint32  len(node domain)                node domain (UTF-8)
uint32  len(challenge id)               challenge id (UTF-8, the row's UUID)
uint32  len(nonce)                      nonce (raw bytes, no encoding)
uint32  len(fingerprint)                fingerprint (UTF-8, "SHA256:<base64>")
uint32  len(expires_at)                 expires_at (ASCII decimal Unix seconds)
```

`expires_at` is truncated to whole seconds before framing: the client only ever sees it as a
`google.protobuf.Timestamp`, and truncating on both sides is what makes the server's and any
independent verifier's encoding agree byte-for-byte without the client reproducing a
sub-second value it was never given. Implemented once, in `@patches/domain`
(`packages/domain/src/ssh/challenge-blob.ts`'s `buildSshChallengeBlob` and `ssh/wire.ts`'s
`encodeSshString`/`SshReader`) — A-020: both `apps/server` (`ssh-challenge.service.ts`) and
`apps/tui` (`auth/ssh-login.ts`, `auth/ssh-enroll.ts`) import this same package rather than
each keeping their own copy of the layout, and a parity test in the package (plus one on each
importing side) pins a fixture to byte-identical output. Length-prefixed framing throughout is
what stops one field's bytes from being able to bleed into its neighbour's, the usual way a
"concatenate everything into one blob" scheme breaks.

### Requirements

- The server verifies the signature over a blob **it reconstructs itself**. It never signs or
  accepts a blob whose contents the client chose.
- Challenges: single-use, TTL ≤ 120 s, consumed atomically, rate-limited per peer address
  (§102). Not keyed on anything the request itself supplies (a candidate fingerprint,
  `CompleteSshLogin`'s challenge id) — those are caller-chosen, so a limiter keyed on them
  would never see the same bucket twice. **Status: planned** — narrowing _login_ by a claimed
  handle is reserved in the RPC (`BeginSshLoginRequest`) but not implemented; there is
  currently no way for a request to supply one.
- **No enumeration.** SSH public keys are public — GitHub serves them at `/<user>.keys` — so
  confirming "this key is enrolled here" links an external identity to a Patches account.
  `BeginSshLogin` returns a challenge regardless of enrollment, and every `CompleteSshLogin`
  failure is one generic `UNAUTHENTICATED`, whether the key is unknown, revoked, or the
  signature is bad.
- Algorithms: prefer `ssh-ed25519`; `rsa-sha2-256`/`rsa-sha2-512` may be accepted; SHA-1
  `ssh-rsa` is rejected.
- **Private keys never touch Patches.** Signing happens in the agent. Patches never reads,
  requests, transmits, or stores a private key under any flag. With no agent available, the
  client may read a `.pub` file for enrollment only, and must fall back to another credential
  type to log in.

### Enrollment

At registration the TUI may enumerate agent identities and `~/.ssh/*.pub` and offer them —
"found 3 SSH identities, use `id_ed25519` as your Patches identity key?" Enrollment is always
explicit confirmation, never automatic. Multiple keys per user is the normal case; each gets a
`label` ("work laptop").

`AddCredential(SSH_PUBLIC_KEY)` requires a **server-verified possession proof** (B-021), not
just the client's own local check the agent will vouch for the key:

```text
(authenticated)  BeginSshEnrollment(public_key_openssh)
                 |----------------------------------------------------------->|  issue a
                 |<-----------------------------------------------------------|  challenge

                 sign the enroll-domain blob via the agent, never a private key

(authenticated)  AddCredential(SSH_PUBLIC_KEY, secret, ssh_proof: {challenge_id, signature})
                 |----------------------------------------------------------->|  verify sig
                 |<-----------------------------------------------------------|  credential
```

`BeginSshEnrollment` is authenticated (`AuthGuard`) and issues a single-use, TTL ≤ 120 s
challenge from the same `ssh_login_challenges` table as login, distinguished by a `purpose`
column (`LOGIN`/`ENROLL`, B-025) and bound at issuance to the caller's own `user_id`
(`bound_user_id`) and to the fingerprint of `public_key_openssh` (`bound_fingerprint`) — unlike
login, there is no enumeration concern here (the caller already proved who they are), so the
binding happens up front rather than being re-derived at completion. The signed blob is the same fixed-order
encoding as login's, but with domain separator `"patches-ssh-enroll-v1"`
(`SSH_ENROLL_DOMAIN_SEPARATOR` in `@patches/domain`) in place of `"patches-ssh-login-v1"`, so a
login signature can never be replayed as an enrollment proof or vice versa. Verification reuses
the exact same signature verifier as login (`verifySshSignature`), so SHA-1 `ssh-rsa` and
sub-2048-bit RSA are rejected identically. Every failure — missing proof, wrong user, wrong
key, expired or replayed challenge, bad signature — is either `VALIDATION_ERROR` (proof
missing entirely — a client bug, not an auth failure) or one uniform `AUTH_INVALID_CREDENTIALS`
(→ `UNAUTHENTICATED`) for everything else, mirroring login's no-distinguishing-failure-modes
reasoning even though enumeration itself isn't the threat model here.

`ssh_login_challenges.purpose`/`bound_user_id`/`bound_fingerprint` (B-025) replaced an earlier
storage deviation: enrollment used to JSON-encode its binding into the `claimed_handle` text
column (login's own field, always left `null` by `BeginSshEnrollment`) rather than having
dedicated columns. `SshChallengeService.consumeEnrollmentProof` now reads `bound_user_id`/
`bound_fingerprint` directly instead of parsing JSON out of `claimed_handle`.

> Open implementation question for Phase 1: which Node library verifies OpenSSH-format public
> key signatures. This needs a `docs/research/` note verified against the library's own docs
> before P1-010 starts — do not pick one from memory.

## 5. GitHub login (OAuth device flow)

GitHub is a **credential, never an identity**. A GitHub account does not become an actor, and
GitHub profile data does not populate handle, display name, avatar, or bio without a separate
explicit user action. Patches issues its own session in every case, so §33's "do not outsource
primary authentication" holds.

Device flow is used because it is the only OAuth flow needing no browser _on this machine_.
Verified against
https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
(2026-08-17):

| Step                | Detail                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request device code | `POST https://github.com/login/device/code`, params `client_id` (required), `scope`                                                              |
| Poll for token      | `POST https://github.com/login/oauth/access_token`, params `client_id`, `device_code`, `grant_type=urn:ietf:params:oauth:grant-type:device_code` |
| Polling rate        | never faster than the returned `interval`; on `slow_down`, add 5 seconds                                                                         |
| Errors to handle    | `authorization_pending`, `slow_down`, `expired_token`, `access_denied`, `device_flow_disabled`                                                   |
| Prerequisite        | device flow must be **explicitly enabled** in the OAuth app's settings                                                                           |
| Stable account id   | `GET https://api.github.com/user` → `id` (https://docs.github.com/en/rest/users/users)                                                           |

Mapped onto RPCs: `BeginGitHubLogin` returns the user code, verification URI, and polling
interval; `PollGitHubLogin` polls and returns either "still pending" or a session envelope.

Requirements:

- The credential identifier is the **numeric `id`**. The login name is mutable and reusable —
  using it as an identifier is an account-takeover vector.
- The GitHub access token is used once, to read the account id, then discarded. No
  third-party access or refresh token is persisted in v0. Requested scope is the minimum that
  returns the account id.
- Linking GitHub to an existing account requires an authenticated Patches session.
- GitHub login is additive. Patches always offers at least one fully browserless path, and
  the reference node always offers both password and SSH (§153, §167).

Scheduled for **Phase 6**, not Phase 1: it is the first outbound HTTP call to a third party
(so it wants Phase 6's URL/timeout/SSRF baseline), account linking is a takeover surface best
built alongside suspension and audit logging, and no item in the v0 acceptance checklist
(§158) depends on it.

## 6. Passkeys (deferred)

Not in v0. WebAuthn is browser/relying-party mediated by specification
(https://www.w3.org/TR/webauthn-2/); a CLI would have to speak CTAP2 directly to an
authenticator, which is plausible given CTAP2's transport-level design but is not a
documented first-class scenario. `PASSKEY` is reserved in the credential type enum so adding
it later is a new verifier, not a migration.

## 7. Per-node sessions in the client

The client talks to nodes, plural (§163, §169):

```bash
patches login <node>        # patches login patches.social
patches accounts            # list stored accounts, mark the active one
patches use @alice@node     # switch active account
patches logout [node]
```

- `CredentialStore` (§37) is keyed by **node origin + user id**. Sessions from different nodes
  are never interchangeable, and a token is never sent to any origin but its issuer.
- Default node is the reference node, overridable by config and environment.
- The config file lists known nodes and the active account and **contains no tokens**. Tokens
  live in the OS keyring (`@napi-rs/keyring`, used defensively per §37), with the guarded
  file fallback and its warning behavior unchanged.
- The client refuses to silently downgrade transport security: plaintext or an untrusted
  certificate requires an explicit, visible opt-in.

## 8. Email policy

Email is recovery and verification only — never the account identifier, never the login key
(§165).

| Account shape                   | Recovery email                                             |
| ------------------------------- | ---------------------------------------------------------- |
| Only credential is `PASSWORD`   | **Required and verified** — otherwise reset has no channel |
| Holds a non-password credential | Optional                                                   |
| Node policy requires it         | Required (the reference node's invite-only alpha does)     |

An account with exactly one credential and no verified email is prompted to add a second
credential or a recovery address. This is a real trade: an SSH-only user who loses their key
with no second credential loses the account. That is stated at enrollment rather than
papered over by quietly requiring email.

## 9. Rate limiting (A-018)

Spec §102 requires login, registration, password reset, and verification resend to be
rate-limited **consistently across every server process**, since v0 has no Redis. `apps/
server/src/modules/auth/rate-limit.service.ts` implements this as two layers, both always
checked (never one instead of the other):

1. **Process-local, in-memory** (`RateLimitService.consume`/`consumePeer`) — a fixed-window
   counter map, keyed per subject and, for actions whose subject is otherwise caller-chosen
   (`register`, `ssh_challenge`, `ssh_complete`), also per network peer. Cheap, but a
   restart forgets it and N server processes multiply the effective limit by N.
2. **Database-backed** (`DbRateLimitStore` + `RateLimitService.consumeDistributed`/
   `consumeDistributedPeer`) — the same fixed-window budget, enforced through one row per
   `(key, window_start)` in `rate_limit_buckets` (`packages/database`). `windowStart` is
   `floor(now / windowMs) * windowMs`, not caller-supplied, so every process racing the same
   bucket in the same instant computes the identical primary key. The increment is an
   `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING count`, never a read-then-write, so
   two processes can never both believe they were first.

Applied to the flows spec §102 names by name, plus SSH challenge issuance (carried over
from the original P1-008 scope): `register`, `login`, `password_reset`, `verify_email`,
`resend_verification`, `ssh_challenge`. Everything else (`media_begin_upload`,
`github_begin_login`, `github_poll_login`, `ssh_complete`) stays process-local only — §102
explicitly allows coarse throttles to stay process-local, and these are not the
credential-guessing/email-sending surfaces the spec calls out.

**Sweep.** `rate_limit_buckets` has no TTL of its own; `DbRateLimitStore.increment` lazily
deletes rows past their `expires_at` with low probability (1-in-50) on every call, rather
than a dedicated worker job. Chosen over a scheduled `apps/worker` job because nothing in
this codebase currently schedules a _recurring_ job on a timer at all (`CLEAN_EXPIRED_TOKENS`
has the same gap — its handler exists but nothing enqueues it periodically yet); adding that
scheduling primitive is out of scope for this task and the lazy sweep needs none of it. Revisit
if/when a real cron-style scheduler lands in `apps/worker`.

## 10. Security checklist for Phase 1 review

- [ ] No plaintext secret of any type is stored; `secret_hash` never leaves the server.
- [ ] Argon2id parameters benchmarked on deployment hardware (§34).
- [ ] Refresh rotation + reuse detection revokes the family (§36).
- [ ] SSH challenge is single-use, TTL-bounded, node-bound, purpose-bound, replay-tested.
- [ ] Credential enumeration is impossible via `BeginSshLogin`, `CompleteSshLogin`,
      `Register`, or password reset (uniform responses and timing).
- [ ] SHA-1 `ssh-rsa` rejected; algorithm downgrade tested.
- [ ] Rate limits on login, register, reset, verify, and challenge issuance (§102), enforced
      both process-locally and database-backed across every server process (§9, A-018).
- [ ] Revoking the last active credential fails.
- [ ] Adding a credential requires an authenticated session.
- [ ] No third-party OAuth token persisted anywhere.

## 11. Related documents

- [`data-model.md`](./data-model.md) — `users`, `credentials`, `ssh_login_challenges` schema
- [`api.md`](./api.md) — `AuthService` / `NodeService` RPC list
- [`tui.md`](./tui.md) — client architecture and credential storage
- ADR [0011](../decisions/0011-credentials-separate-from-identity.md),
  [0010](../decisions/0010-argon2id-jose-jwt.md)
