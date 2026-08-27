# HANDOFF: E2EE two-device session proof + web ungate

Branch: `agent/wt-1787796976-2548548` (worktree `/home/allie/develop/patches-agent-wt/1787796976-2548548`)
Base tip when started: `43f3de2b` (ADR 0033 client adaptation + ADR 0036 always-on E2EE landed)

## Task

1. Job 1: server integration test proving two real enrolled devices establish an X3DH session
   through the real RPC sequence (EnrollDevice x2 -> ClaimPrekeyBundles -> X3DH ->
   CreateE2eeConversation reserve -> SendEnvelopes -> ListMailboxEnvelopes -> decrypt) and the
   recovered plaintext matches what was sent, franking intact. This is the ADR 0033 §7
   acceptance criterion for the whole epic. No stubs/mocks/shortcuts.
2. Job 2 (only if 1 passes): flip `apps/web/src/e2ee/availability.ts` SESSION_SETUP_AVAILABLE to
   true, delete WEB_E2EE_SESSION_UNAVAILABLE_COPY and all references.
3. Job 3 (only if 2 happened): give `webE2ee().createConversation()` a real signature, wire
   MessagesRoute "New Message" button to it.

Own: apps/server/test/**, apps/web/src/e2ee/{availability,web-e2ee,transports}.ts + tests,
apps/web/src/routes/{MessagesRoute,MessageThreadRoute}.tsx + tests.
Forbidden: packages/crypto/**, packages/domain/**, packages/proto/**, packages/database/**,
apps/tui/**, apps/server/src/** (a real need to touch these is a finding to report, not to do).

## Status: Job 1 DONE and committed (`df55cc3`). Starting Job 2.

## Done so far

- Rebased onto `feat/b124-one-identity-transcript-family` twice as the coordinator landed more
  client-adaptation commits (43f3de2b -> 615f1a2b -> e7cc3fe2). Always re-check
  `git log --oneline feat/b124-one-identity-transcript-family -3` before trusting the tree.
- Wrote `apps/server/test/e2ee-session-bootstrap.integration.test.ts`: two real actors,
  `EnrollDevice` x2 with real canonical-transcript crypto (`signMessagingRoot`,
  `signDeviceCertificate`, `signDeviceRoster`, `signPreKeyBundle` from `@patches/crypto`, real
  X25519 agreement keys via `generateKeyAgreementKeyPair`), then the real client verifier chain
  (`GetIdentityRoot`->`verifyMessagingRoot`, `GetDeviceRoster`->`verifyRosterSnapshot`,
  `ClaimPrekeyBundles`->`verifyPreKeyBundle`), `initiateX3dh`/`respondX3dh` against the branded
  `Verified*` values, a bare `CreateE2eeConversation` reservation (ADR 0035), a real
  `sealDeviceEnvelope`/`SendEnvelopes`/`ListMailboxEnvelopes`/`openDeviceEnvelope` round trip.
  Asserts the recovered plaintext equals what was sent. `mise run check server` green,
  `vitest --config vitest.integration.config.mts` green against the compose Postgres.
- Hit and fixed one real bug in the test itself (not crypto/server): `disposeX3dhSecrets` was
  called right after `initializeInitiatorRatchet`, but `initiated.handshake.ephemeralPublicKey`
  shares its backing buffer with `initiated.initiatorRatchetKey.publicKey` (assigned by
  reference in `initiateX3dh`, not copied) — zeroizing it before handing the handshake to
  `respondX3dh` corrupted the transcript Bob verifies, producing an `AuthenticationError` at
  `x3dh.ts:311` (the initiator-signature check). Fix: defer `disposeX3dhSecrets` for Alice's
  side until after Bob's `respondX3dh` has consumed `initiated.handshake`. Confirmed by reading
  `apps/web/src/e2ee/session-setup.ts`'s own comment, which documents the identical ordering
  constraint for the real client ("frame the setup block BEFORE any disposal").

## Next steps

- Job 2: flip `SESSION_SETUP_AVAILABLE` in `apps/web/src/e2ee/availability.ts`, delete
  `WEB_E2EE_SESSION_UNAVAILABLE_COPY` and its call sites (`web-e2ee.ts`, `MessageThreadRoute.tsx`,
  `MessagesRoute.tsx`, `availability.test.ts`).
- Job 3: give `webE2ee().createConversation()` a real signature (recipient actor ids) via
  `bindConversationCreate` -> `CreateE2eeConversation`, wire `MessagesRoute.tsx`'s "New Message".

## Learnings / risk notes

- The task brief's claim that both clients already used the real verifier chain was true only
  as of the _later_ commit `615f1a2b` — at the worktree's initial branch tip (`43f3de2b`)
  `apps/web/src/e2ee/{enrollment,local-identity,session-setup}.ts` referenced crypto API names
  (`certifyDevice`, `createSignedPreKey`, `rosterDigest`, `PreKeyBundle`/`CertifiedDevice` as
  types) that do not exist post-ADR-0033 — `pnpm --filter @patches/web exec tsc --noEmit` was
  red at that tip. Confirmed green again after rebasing onto `615f1a2b`, which rewrote both
  `apps/tui` and `apps/web`'s e2ee modules onto the current API in one commit (title says as
  much: "both clients establish real E2EE sessions"). Re-verified after the fact:
  `apps/tui/test/e2ee-runtime.test.ts` no longer references the stale names either — my
  earlier concern about it being stale was based on a pre-rebase read and is stale itself.
