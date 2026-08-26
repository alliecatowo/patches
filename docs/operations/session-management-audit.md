# Session-management duplication audit (H-022)

**Status:** implemented (audit only — no code changed as a result)
**Date:** 2026-08-25

H-022 asked for an audit of "accidental" session-code duplication across the codebase,
explicit about NOT touching the intentional TUI/`@patches/client` split ADR 0023 and its
work-plan slice P10-013 already decided. This is that audit's result.

## What exists

Two `class SessionManager` implementations in the repo, and only two:

- `packages/client/src/session.ts` — the SDK's manager. Holds one `{ accessToken,
refreshToken }` pair behind a pluggable `CredentialStore`, decodes JWT `exp` for a
  `useSyncExternalStore`-shaped reactive snapshot, does single-flight refresh-and-retry-once
  on `UNAUTHENTICATED` (`withSession`), and (B-169) syncs across browser tabs via a
  `storage` event plus a `patches:session-refreshed` `CustomEvent`.
- `apps/tui/src/auth/session.ts` — the TUI's manager. Holds a richer `ActiveSession`
  (`nodeOrigin`, `userId`, the full `Actor`, both token expiries) keyed per-node/per-account
  in its own on-disk credential file, drives `register`/`loginWithPassword`/
  `loginWithRecoveryCode`/SSH login in addition to refresh, sets the ambient ungated-RPC
  token (`setAmbientAccessToken`), and (P12-011) exposes a `needsReauth` /
  `completeReauth` / `cancelReauth` event flow so the Ink shell can show an inline re-auth
  modal instead of a hard sign-out — none of which the SDK's manager has any concept of.

## Verdict: no accidental duplication found

The two classes share one _shape_ — "hold a token pair, single-flight refresh, retry once
on `UNAUTHENTICATED`, else propagate" — but that shape is the entire justification ADR
0023 already gives for keeping them separate (see its "Alternatives considered": _"Adopting
`@patches/client`'s `SessionManager` in this task. Rejected as out of scope: the TUI's
manager owns multi-account keyring credentials and the ambient-token fallback, none of
which is transport-related, and swapping it would put behavior change inside a
no-behavior-change task."_). Past that shared shape, the persistence model (single pair vs.
multi-account keyed store), the auth surface each drives (refresh-only vs.
register/login/recovery/SSH/refresh), and the UX contract on expiry (throw vs. an
awaitable re-auth modal) are all genuinely different. Neither file was copy-pasted from the
other — grepping the repo for `class SessionManager` and for the JWT-`exp`-decode helper
(`decodeJwtExpiry`) each turn up exactly these two independent implementations, and no
third partial copy exists anywhere else (`apps/web` reads `@patches/client`'s manager
directly, per `apps/web/src/api/client.ts`).

**Conclusion: preserve as-is.** No dedup change is in scope or warranted. If a future
change wants to unify them, that decision belongs in a new ADR that supersedes ADR 0023's
"Alternatives considered" entry above, not a quiet refactor.
