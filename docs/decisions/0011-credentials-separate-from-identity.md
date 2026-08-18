# 0011. Credentials are separate from identity

**Status:** Accepted
**Date:** 2026-08-17

## Context

`INITIAL_VISION.md` §20 modeled authentication as a single `users.password_hash` column plus
a mandatory email address, and §33 listed the v0 auth inputs as "email, handle, password,
email verification". That is the conventional shape, and it embeds two assumptions that are
wrong for this product:

1. **The credential is the identity.** With one password column, "how you log in" and "who
   you are" are the same row. Adding a second way to log in means bolting columns onto
   `users`, and every future method (passkeys, hardware tokens, another provider) makes that
   table worse.
2. **Everyone has, and wants to give us, an email address.** Patches is a terminal-native
   product whose users overwhelmingly already have an SSH key and an agent running. Making
   email the mandatory account root imposes a signup flow the product's own audience finds
   pointless, and makes Patches the custodian of a mailbox list it does not need.

Meanwhile the terminal-native constraint is real: §153 forbids requiring a browser for
normal TUI usage, and §38 says to avoid requiring a browser for registration. That rules out
a standard redirect-based OAuth login as a primary path.

Separately, §33 forbids outsourcing primary authentication to Firebase/Auth0/Clerk/Supabase.
Any third-party sign-in has to be evaluated against that intent, not just its letter.

## Decision

Split credentials from identity. See `INITIAL_VISION.md` §165–§168 for the normative text and
`docs/architecture/auth.md` for the flows.

- `users` holds identity and account state: `id`, `actor_id`, `status`, and a **nullable**
  `recovery_email` / `email_verified_at`. `password_hash` is removed from `users`.
- A new `credentials` table holds one row per way to authenticate: `type`
  (`PASSWORD | SSH_PUBLIC_KEY | GITHUB`, `PASSKEY` reserved), `identifier`, `secret_hash`
  (Argon2id, `PASSWORD` only), `public_material` (OpenSSH public key blob), `metadata`,
  `label`, `created_at`, `last_used_at`, `revoked_at`.
- A user may hold several credentials, including several SSH keys. Adding or revoking one
  never changes the actor, the handle, or any social relationship. Revoking the last active
  credential fails.
- **v0 methods:** password (Argon2id, universal — §34 unchanged), SSH-key challenge/response
  (the terminal-native path), and GitHub via **OAuth device flow** (browserless on this
  machine; a credential, never the identity). Passkeys are deferred — WebAuthn is
  browser-mediated by specification, and a CLI would have to speak CTAP2 directly, which is
  not a documented first-class scenario today.
- **Email becomes conditional:** required for accounts whose only credential is a password
  (otherwise password reset has no channel), optional for accounts holding a non-password
  credential, and a node may require it by policy — the invite-only alpha on the reference
  node does.
- Patches always issues its own sessions (§35–§36). No third-party access or refresh token is
  persisted; the GitHub token is used once to read the numeric account id and discarded.

Two refinements to the approved sketch, made while encoding it:

- `identifier` is **NULL for `PASSWORD`**, with a partial unique index enforcing at most one
  active password per user. The sketch proposed storing the normalized email there; that
  would put the same value in two tables and guarantee a drift bug the first time someone
  changes their recovery address. Password login resolves the user by handle or verified
  recovery email, then loads that user's password credential.
- Secret and public material are **separate columns** (`secret_hash` vs `public_material`)
  rather than one polymorphic `secret` column. An SSH public key is not a secret, and a
  single column invites logging or serializing the whole row — the split makes "never return
  `secret_hash` over gRPC" a mechanical rule instead of a judgment call.

## Consequences

- Adding an authentication method is a new `type` and a verifier, not a migration on `users`
  and not a change to any social table.
- Login becomes several RPCs rather than one (§168). Clients handle a single session envelope
  regardless of method, so the divergence stops at the auth boundary.
- Password reset only applies to accounts with a verified recovery email. Accounts without
  one recover by holding a second credential — which is why registration prompts for one.
- **Account recovery genuinely gets harder for SSH-only users.** Lose the key with no second
  credential and no email, and the account is gone. This is accepted, stated to the user at
  enrollment, and mitigated by prompting for a second credential — not by quietly requiring
  email after all.
- SSH public keys are public (GitHub serves them at `/<user>.keys`), so key enrollment is a
  correlation risk: confirming "this key exists here" would link a GitHub identity to a
  Patches account. Hence the no-enumeration requirement in §166 — indistinguishable failures
  and a challenge issued regardless of enrollment.
- GitHub device flow adds outbound HTTP to a third party, which is why it is scheduled in
  Phase 6 alongside the URL/timeout/SSRF validation baseline rather than in Phase 1.
- More auth surface means more tests. Challenge replay, expiry, cross-node replay, algorithm
  downgrade, credential enumeration, and last-credential revocation are all named test cases,
  not optional coverage.

## Alternatives considered

- **Keep `users.password_hash` and add nullable `ssh_key`/`github_id` columns.** Rejected:
  each method widens `users`, multi-key support needs a side table anyway, and nothing stops
  a query from treating a login method as identity.
- **Make SSH the only method.** Rejected: locks out anyone without a key, makes onboarding
  from a phone or a fresh machine impossible, and leaves no recovery path.
- **Make GitHub the primary identity.** Rejected outright: it violates §33's intent, makes a
  third party the account root, and would mean losing your GitHub account loses your social
  identity. GitHub is a credential.
- **Standard redirect OAuth instead of device flow.** Rejected: requires a browser and a
  loopback redirect on the user's machine, which §153 prohibits for normal TUI usage.
- **Passkeys in v0.** Deferred: WebAuthn assumes a browser relying party; direct CTAP2 from a
  CLI is plausible but not a documented first-class scenario, so it is not a v0 dependency.
