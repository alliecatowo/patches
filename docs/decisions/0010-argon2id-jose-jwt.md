# 0010. Argon2id password hashing with short-lived JWT access tokens and opaque rotating refresh tokens

**Status:** Accepted
**Date:** 2026-08-17

## Context

Patches implements authentication directly in the NestJS application rather than
outsourcing it to a third-party auth provider (`INITIAL_VISION.md` §33). That means the
project owns password storage security and session/token design end to end, and has to get
both right without leaning on a vendor's defaults. Passwords must never be stored reversibly.
Sessions need to work well for a long-lived TUI client that may stay logged in across
restarts, while limiting the blast radius of a leaked token.

## Decision

**Passwords:** hash with **Argon2id**, per current OWASP Password Storage Cheat Sheet
guidance, using a maintained Node implementation. Parameters are benchmarked against actual
deployment hardware rather than copied blindly — cheap enough to not bottleneck login,
expensive enough to resist offline cracking. Passwords are never encrypted reversibly, only
hashed.

**Access tokens:** short-lived bearer JWTs (suggested lifetime 15 minutes), asymmetrically
signed (to allow future multi-service verification without sharing a symmetric secret).
Claims are minimal: `sub` (user id), `actor_id`, `session_id`, `iat`, `exp` — no private
profile data and nothing expected to change frequently, since a live JWT can't be
invalidated mid-lifetime without a revocation check.

**Refresh tokens:** cryptographically random, high-entropy, **opaque** (not JWTs), stored
**hashed** in the database (never plaintext), and **rotated on every refresh**. The
`refresh_tokens` table tracks `id`, `user_id`, `session_id`, `token_hash`, `expires_at`,
`used_at`, `revoked_at`, `created_at`, `user_agent`. Refresh-token **reuse detection** is
implemented: if an already-rotated (already-used) token is presented again, the entire
session/token family is revoked — treating reuse as a signal of token theft.

## Consequences

- A stolen access token is only useful for at most ~15 minutes, sharply limiting the value
  of a leaked bearer token compared to a long-lived session token.
- Refresh-token rotation plus reuse detection means a stolen *refresh* token gets one use
  before it either advances the legitimate session (attacker and victim racing, detectable)
  or is caught outright as reuse — a real, cheap defense against token exfiltration, at the
  cost of needing careful concurrency handling around rotation (races between legitimate
  refreshes must not falsely trigger revocation).
- Storing only refresh-token *hashes* means a database read alone doesn't hand out valid
  sessions — a stolen DB dump doesn't equal stolen sessions.
- Argon2id parameter tuning is an ongoing operational responsibility, not a "set once and
  forget" choice — hardware changes (e.g. moving Fly Machine sizes) may warrant
  re-benchmarking.
- Asymmetric JWT signing adds slightly more setup (key management: `JWT_PRIVATE_KEY`,
  `JWT_PUBLIC_KEY` as configuration, see `docs/operations/local-development.md`) than a
  shared HMAC secret, in exchange for future services being able to verify tokens without
  holding a signing secret.
- The TUI's `CredentialStore` (using `@napi-rs/keyring`, with a defensive opt-in fallback
  when no OS credential backend exists) is a load-bearing part of this design — refresh
  tokens must never be stored world-readable on disk.

## Alternatives considered

- **bcrypt or scrypt for password hashing.** Rejected: OWASP currently recommends Argon2id
  as the primary choice when available; bcrypt/scrypt remain acceptable fallbacks elsewhere
  but there's no reason to choose them over Argon2id here.
- **Long-lived opaque session tokens (no JWT) for API auth.** Rejected: would require a
  database round-trip on every request to validate a session, whereas short-lived signed
  JWTs let most requests verify statelessly; the refresh token still provides the
  revocable, database-backed control point.
- **Symmetric (HMAC) JWT signing.** Rejected in favor of asymmetric signing specifically to
  keep the door open for future services (e.g. a federation-facing process) to verify
  tokens without being handed the signing secret itself.
- **Outsourcing auth to Firebase/Auth0/Clerk/Supabase Auth.** Rejected: explicitly
  prohibited (`INITIAL_VISION.md` §33) — authentication is core product logic here, not
  something to hand to a third party in v0.
