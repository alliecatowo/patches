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

## Status: IN PROGRESS — exploring existing test file + crypto package API surface

## Done so far

- Confirmed worktree tip has ADR 0033 client adaptation (fb3311fb..43f3de2b).
- Read apps/server/test/e2ee.integration.test.ts (1895 lines) partially (lines 1-1272) — has
  enrollFirstDevice/enrollAdditionalDevice/reserveAndSend helpers, uses raw random bytes for
  envelope ciphertext (NOT real X3DH/ratchet) — this suite does not prove decryption end-to-end,
  which is exactly the gap Job 1 needs to close.

## Next steps

- Finish reading e2ee.integration.test.ts (offset 1273+) for any remaining relevant helpers.
- Find the client-side X3DH/ratchet API in packages/crypto (initiateX3dh, verifyPreKeyBundle,
  verifyRosterSnapshot, verifyMessagingRoot) — likely already used in apps/web/src/e2ee or
  apps/tui equivalent; grep for initiateX3dh usage to find the real call shape.
- Write new test file apps/server/test/e2ee-session-bootstrap.integration.test.ts (or similar)
  reusing helpers from e2ee.integration.test.ts where possible (may need to export helpers or
  duplicate minimal subset — check if helpers are exported).
- Run against compose stack: mise run compose -- up -d ; pnpm db:migrate ; then vitest.

## Learnings / risk notes

- e2ee.integration.test.ts's TestEnvelope builder uses `randomBytes(64)` as ciphertext — opaque
  to the node by design (ADR 0020 §8), so reusing it as-is will NOT exercise real decryption.
  Job 1 needs actual X3DH + Double Ratchet encrypt on the sender side and matching decrypt on
  receiver side using packages/crypto's real API, not this suite's random-bytes stand-in.
