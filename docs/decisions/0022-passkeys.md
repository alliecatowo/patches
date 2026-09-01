# 0022. Passkeys: amending 0011's deferral now that a browser relying party exists

**Status:** Accepted
**Date:** 2026-08-19

## Context

[0011](0011-credentials-separate-from-identity.md) deferred passkeys with a specific, narrow
reason: "WebAuthn assumes a browser relying party; direct CTAP2 from a CLI is plausible but not a
documented first-class scenario." That reasoning was scoped to the TUI, and it still holds there —
`apps/tui` has no WebAuthn support and none is planned. But [0016](0016-connect-transport-and-client-sdk.md)
subsequently paused (not cancelled) a browser web client, and P15 shipped `apps/web`: a real
in-browser relying party now exists. 0011's blocker — no browser to be the RP — no longer applies
to that surface, and the database schema was already written expecting this (`CREDENTIAL_TYPES`
has carried `'PASSKEY'` since Phase 1, reserved-but-unused; `auth.mapper.ts` has mapped it to
`CREDENTIAL_TYPE_UNSPECIFIED` on the wire pending exactly this ADR).

Amendment B (§184.3) forbids paywalling _function_; a passkey is an additional credential type
alongside password/SSH/GitHub/recovery-code, available to every account regardless of capability
tier, so this raises no such concern.

## Decision

Ship passkeys as a fifth credential type, web-client-only, using `@simplewebauthn/server` (Node,
CJS-compatible per `docs/research/simplewebauthn.md`) and `@simplewebauthn/browser` (ESM, Vite-
compatible).

- **Relying Party ID and origins are explicit, validated configuration.** `PASSKEY_RP_ID` is a
  bare hostname and `PASSKEY_ORIGINS` is a comma-separated list of bare browser origins. When
  omitted, they default to `new URL(PUBLIC_ORIGIN).hostname` and `[PUBLIC_ORIGIN]`, preserving
  existing nodes. This lets a web client hosted on another registrable site use passkeys while
  keeping the node's `PUBLIC_ORIGIN` for federation and other canonical URLs. The production
  reference node sets `PASSKEY_RP_ID=patches-web.pages.dev` and accepts
  `https://patches-web.pages.dev`.
- **No new columns on `credentials`.** The existing `identifier` (already the type-scoped lookup
  key: SSH fingerprint, GitHub numeric id) holds the WebAuthn credential ID (base64url, unique
  per the existing partial unique index on `(type, identifier)`); the existing `publicMaterial`
  (already free text, already "public, safe to return") holds the COSE public key, base64-encoded;
  the existing `metadata` jsonb (already "non-secret provider bookkeeping") holds `signCount`,
  `transports`, `credentialDeviceType`, `credentialBackedUp`. This is the same shape ADR 0011 chose
  for SSH keys, reused rather than reinvented — a passkey is, structurally, another public-key
  credential with a server-issued challenge/response, which is exactly what `SshChallengeService`
  already models for SSH.
- **One new table, `webauthn_challenges`**, mirroring `ssh_login_challenges`: single-use,
  short(er)-TTL server-issued challenges, `purpose` (`REGISTRATION` | `LOGIN`), `boundUserId` for
  registration (the authenticated caller — mirrors SSH enrollment's `boundUserId`/
  `boundFingerprint`). TTL is 5 minutes, not SSH's 120 seconds: an SSH challenge is signed
  automatically by an agent with no human in the loop; a passkey ceremony waits on a biometric/PIN
  prompt.
- **Sign-count regression is treated as a security event, not silently ignored.** Per WebAuthn
  §6.1.1 and `@simplewebauthn/server`'s own guidance, a returned `newCounter` that does not exceed
  the stored counter (when the stored counter is nonzero — many platform authenticators report 0
  unconditionally and never increment, which is normal, not a regression) indicates the credential
  was possibly cloned. The login is rejected with the same uniform `AUTH_INVALID_CREDENTIALS` every
  other auth failure here uses, and a `SECURITY` notification is written — the same convention
  `RecoveryLogin` (P15-003) already established for "this happened to your account and you should
  know."
- **The verifier is DI-injected** (`PasskeyVerifierService`, wrapping the four `@simplewebauthn/
server` calls) so integration tests can override it with a stub rather than driving a real
  WebAuthn ceremony end-to-end, which requires a browser/authenticator and is not practical in a
  Node integration test. The DB-persistence half (challenge issuance/consumption,
  `PasskeyChallengeService`) and the RPC plumbing (`AuthController`/`AuthService`) are exercised for
  real against Postgres and real gRPC; only "does this signature actually verify against this COSE
  key" is stubbed, and the report says so plainly rather than claiming full coverage it doesn't have.

## Consequences

**Positive.** Passkey users get a phishing-resistant, device-backed credential with no new
database migration beyond one small challenge table — the credential model 0011 chose absorbs it
cleanly, which is a point in favor of that ADR's original design. The web client's `/login` and
`/settings/credentials` gain a strictly additive capability; nothing about password, SSH, GitHub,
or recovery-code auth changes.

**Negative.** Passkeys remain unavailable from the TUI — 0011's original CTAP2 objection is
unchanged for that surface, so an SSH-first or terminal-only user gets no benefit from this ADR.
`ListCredentials` now returns a fifth type the TUI must render _something_ reasonable for (label +
"passkey", no fingerprint) even though it can never add or use one — a small, bounded TUI
follow-up. Sign-count tracking is best-effort: an authenticator that never increments its counter
(0 always) gets no clone detection at all, which is a known, spec-acknowledged limitation of the
counter mechanism itself, not something this implementation can improve on.

## Alternatives considered

- **A dedicated `passkey_credentials` table.** Rejected: every column it would need already exists
  on `credentials` under a name whose meaning already generalizes (see Decision above); a second
  table would mean `ListCredentials`/`RevokeCredential`/the last-credential guard all need a
  `UNION` or a second code path for exactly one credential type, for no benefit.
  the WebAuthn credential ID.
- **Store the COSE public key as raw `bytea`.** Rejected for consistency: `publicMaterial` is
  `text` for every existing credential type (an OpenSSH key line), and base64-encoding ~77 bytes of
  COSE key material costs nothing worth a column-type migration to avoid.
- **Skip sign-count regression handling.** Rejected: `@simplewebauthn/server`'s own docs treat this
  as a documented clone-detection signal, and every other credential type in this codebase already
  reacts to a security-relevant event (`RecoveryLogin` → `SECURITY` notification); silently
  accepting a lower counter would be a regression in posture, not just a missed feature.
