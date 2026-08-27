# Handoff — E2EE working end-to-end on the web client

**Branch:** `feat/b124-one-identity-transcript-family`
**Epic:** [#250](https://github.com/alliecatowo/patches/issues/250)
**Written:** 2026-08-26, after an API session limit terminated four in-flight agents.

## Goal

A user can send and read an E2EE DM **in the browser** against the live node. Not a demo, not the
TUI only.

## Why nothing worked (three blockers, not one)

Session bootstrap had never succeeded on **any** client — the web/TUI split was a symptom, not the
cause.

1. **Two identity transcript families** (#149). The node signed and served one byte encoding;
   `initiateX3dh`/`respondX3dh` verified a different one. Translating between them needs the
   peer's _root private key_, so both clients failed closed at `claimPrekeyBundles`. Decided in
   **ADR 0033**. — **DONE**, commit `87f54289`.
2. **The conversation-id/AAD gap.** Every envelope's AEAD associated data binds the conversation
   id, but `CreateE2eeConversation` minted that id _after_ the client sealed the first message.
   Decided in **ADR 0035**. — **PARTIALLY DONE**, commit `51a1e2ca` (explicitly WIP).
3. **The node discarded identity-root transcript bytes** (#251) — found by checking the wire
   against ADR 0033 rather than trusting the ADR. `GetIdentityRoot` served `Buffer.alloc(0)`, so
   `verifyMessagingRoot` (the root of the whole chain, and a branded type every downstream
   verifier requires) could never be constructed for a peer. Blocker 1 alone would not have been
   enough. — **DONE**, commit `af3c359`.

## Commits on the branch

| Commit     | State              | What                                                                                                                      |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `e160135`  | green              | `@patches/domain` transcript-domain registry; ADR 0027 warning hoisted to one shared constant                             |
| `af3c359`  | green              | #251 — node persists and serves identity-root transcript bytes                                                            |
| `87f54289` | green              | **#149 / ADR 0033** — one identity transcript family in `@patches/crypto`, branded `Verified*` types, regenerated vectors |
| `51a1e2ca` | **WIP, not green** | ADR 0035 proto + schema + reserve path                                                                                    |

`mise run check crypto`, `check domain`, `check database`, `check tui` were green at `af3c359`.
A full integration run at `af3c359` was **938/938 passing**.

## The branch does not build right now

Two known reasons, both expected:

1. **`apps/server` has not been adapted to the new `@patches/crypto` API.** This was in flight when
   the session limit hit; its worktree (`/home/allie/develop/patches-agent-wt/1787792563-2447173`)
   is **empty** — that agent died before writing anything. Start this from scratch.
2. **ADR 0035 is unfinished** — see below.

## Next steps, in order

### 1. Adapt `apps/server` to the new crypto API (nothing else can proceed)

`apps/server/src/modules/e2ee/e2ee.codec.ts` keeps ONLY proto/`Date` adaptation
(`requireTimestamp`, `assertBytesEqual`, `toBytes`, ms↔Date) and imports the codec from
`@patches/crypto`. Delete `CERTIFICATE_TRANSCRIPT_DOMAIN`, `ROSTER_TRANSCRIPT_DOMAIN`,
`PREKEY_BUNDLE_TRANSCRIPT_DOMAIN` and the node's own encode/decode. Update callers:
`e2ee.mapper.ts`, `device-roster.service.ts`, `roster-chain.ts`, `prekey.service.ts`,
`identity-root.service.ts`, `e2ee-conversation.service.ts`, `e2ee-crypto.adapter.ts`,
`group-control.ts`, `e2ee-fanout.ts`, and the module's tests.

`prekey.service.ts:151,410` pins `protocolVersion: ''` as a documented kludge — ADR 0033 §2
removes that field from the T4 transcript, so the kludge goes with it.

New surface (deleted: `encodeDeviceCertificate`, `encodeDeviceRoster`,
`encodeSignedPreKeyStatement`, `encodeCertifiedDevice`, `certifyDevice`, `createSignedPreKey`,
`rosterDigest`, `verifyDeviceRoster`, `CERTIFICATE_CONTEXT`, `ROSTER_CONTEXT`, `PREKEY_CONTEXT`,
`RosterRollbackError`, and the plain `CertifiedDevice`/`DeviceRoster`/`PreKeyBundle`/`SignedPreKey`
types):

```ts
encode/decode{MessagingRoot,DeviceCertificate,DeviceRoster,PreKeyBundle}Transcript(...)
signMessagingRoot(rootPrivateKey, fields): { rootBytes, selfSignature }
countersignMessagingRoot(previousRootPrivateKey, rootBytes): Uint8Array
signDeviceCertificate(rootPrivateKey, fields): { certificateBytes, rootSignature, certificateDigest }
signDeviceRoster(rootPrivateKey, fields): { rosterBytes, rootSignature, rosterDigest }
signPreKeyBundle(deviceSigningPrivateKey, fields): { bundleBytes, deviceSignature }
identityTranscriptDigest(bytes): Uint8Array

verifyMessagingRoot({ rootBytes; selfSignature; previousRootSignature?; previousRoot?; nowMs }): VerifiedMessagingRoot
verifyCertifiedDevice({ certificateBytes; rootSignature; root; nowMs }): VerifiedCertifiedDevice
verifyRosterSnapshot({ rosterBytes; rootSignature; root; certificates: readonly {certificateBytes; rootSignature}[]; nowMs }): VerifiedRosterSnapshot
verifyPreKeyBundle({ bundleBytes; deviceSignature; certificateBytes; certificateRootSignature; oneTimePreKey?; roster; nowMs }): VerifiedPreKeyBundle
rosterHasActiveCertificate(roster, certificateDigest): boolean
CRYPTO_TRANSCRIPT_DOMAINS: readonly string[]
// vectors: import '@patches/crypto/vectors/identity-transcripts.json' with { type: 'json' }
```

Also owed here:

- **ADR 0033 §5's clean-break migration** deleting every old-encoding row in FK order:
  `e2ee_mailbox_envelopes`, `e2ee_logical_messages`, `e2ee_group_control_events`,
  `e2ee_one_time_prekeys`, `e2ee_one_time_prekey_key_ids`, `e2ee_signed_prekeys`,
  `e2ee_device_rosters`, `e2ee_device_identities`, `e2ee_identity_roots`. NOT `conversations`,
  NOT `e2ee_node_franking_keys`, NOT `e2ee_report_evidence*` — and it must **fail loudly** rather
  than delete if any evidence row exists. `down()` throws. Timestamp must sort after
  `1787792202409`.
  **Verified safe on the live node 2026-08-26: every one of those tables is empty, including
  `e2ee_report_evidence`.**
- **The cross-package registry union test** (`CRYPTO_TRANSCRIPT_DOMAINS` ∪
  `DOMAIN_TRANSCRIPT_DOMAINS` has no duplicates). It cannot live in `@patches/crypto` — importing
  `@patches/domain` there is the layering edge ADR 0033 forbids. The server suite imports both.
- **§6's server-side vector consumption**: assert the proto/`Date` adapters over the vector's
  field set produce the vector's exact bytes, and that `EnrollDevice` accepts a request built
  from the vector. Read it via the subpath export; do not copy the fixture.

### 2. Finish ADR 0035

Done in `51a1e2ca`: proto edit + regeneration, `conversations.creation_client_request_id` with its
partial unique index, nullable `last_message_at`, the reserve path, `listConversations`'
`IS NOT NULL` filter.

Left: the **other read paths** that could surface a reserved conversation (§5 requires it be
invisible to _everyone_, creator included — sweep `GetConversation`, the DM service, unread counts,
notifications, search rather than trusting a list); the **sender-device check** moved up into
`createE2eeConversation`'s transaction (it lived in `acceptE2eeLogicalMessage`, which no longer
runs on this path) returning `E2EE_DEVICE_NOT_FOUND`; a test asserting a reserve produces **zero
notifications**; and integration tests.

### 3. Both clients (ADR 0034 Stage 1)

Delete **both** `node-transcripts.ts` mirrors, make `claimPrekeyBundles`/`loadPeerRoster` real,
delete `E2eeSetupUnavailableError` (#233's copy problem disappears with the condition).
**Every edit to a module present in both `apps/web/src/e2ee/` and `apps/tui/src/e2ee/` must land
in both copies in the same commit** — four drift events have already happened on this surface.
The shared set is: `enrollment.ts`, `history-transfer.ts`, `local-identity.ts`,
`node-transcripts.ts` (deleted), `runtime-session.ts`, `runtime.ts`, `session-setup.ts`,
`vault-errors.ts`, `vault-format.ts`. `session-setup.ts` also widens prekey ids `u32`→`u64`.

Give this to **one agent**, not two — two agents cannot keep byte-identical copies in sync.

### 4. Web enablement

- Port `chain.ts` from the TUI — web has **zero** identity-chain verification (#166).
- Flip `SESSION_SETUP_AVAILABLE` in `apps/web/src/e2ee/availability.ts` **in the same change** as a
  test that actually establishes a session, and delete the "Use the terminal client until support
  ships" copy, which is false — the TUI was equally blocked (#165).
- Render `E2EE_UNREVIEWED_DEV_MODE_WARNING` from `@patches/domain` persistently on `MessagesRoute`
  and `MessageThreadRoute` (#249). **Required, not optional**: the live node runs
  `E2EE_UNREVIEWED_DEV_MODE=true`, so its capability state is `ISOLATED_TEST_ONLY`, and ADR 0027
  requires the warning on every surface in that state. Do not collapse that state into a boolean.
- Wire a recipient picker to `webE2ee().createConversation()` — it currently takes no arguments
  and always rejects (#238).
- **#252**: neither client replenishes one-time prekeys or rotates its signed prekey. Enrollment
  uploads 100 once; nothing tops up. Invisible today only because no prekey has ever been claimed.
  Land with or right after this stage.

### 5. Prove it (ADR 0033 §7)

A server integration test where two enrolled devices establish a session through the **real RPCs**
and exchange a message that decrypts: `EnrollDevice` → `ClaimPrekeyBundles` → X3DH → ratchet
encrypt → `SendEnvelopes` → `ListMailboxEnvelopes` → decrypt, franking intact. Anything less means
the families are still not unified. This test is also the only regression net for #211/#208's
extraction, which is deliberately sequenced after it.

### 6. Deploy

`pnpm db:migrate` against the live node, deploy, and confirm a real send in the browser.

## Live node facts (verified 2026-08-26, not assumed)

- Franking key **era 1 exists** (created 2026-08-20). `GetE2eeCapability` will resolve — the node
  can accept an E2EE send today.
- **Every E2EE table is empty**, including `e2ee_report_evidence`. `conversations` is empty too.
  6 non-deleted actors. The clean break is safe.
- Migration head is `DropOrphanedLegacyMessageTrigger1787670000000`; neither new migration is
  deployed.
- `E2EE_UNREVIEWED_DEV_MODE=true` (`infra/fly/fly.toml:26`); `E2EE_APPROVED_FRANKING_PROFILES` is
  empty and `E2EE_V1_ENABLED` is false. Neither needs to change to send — capability state is
  `ISOLATED_TEST_ONLY` and that accepts send traffic.
- The retention-sweep job has **never been seeded**, by design (ADR 0031 wants an operator gate).
  Not a blocker; storage grows unbounded until someone triggers it.

## Working notes for whoever picks this up

- **Subagents are worktree-isolated.** They cannot touch `/home/allie/develop/patches`. Integrate
  by `cp`-ing from `<worktree>/<path>`; that part cannot be delegated. Their worktrees branch from
  the **committed** state, so commit each green slice before launching dependent agents.
- Recover a killed agent's work with `git worktree list` then `git -C <wt> status --short` — it
  survives there, and a replacement agent can be told to `cp` it in as a seed.
- Do not run `mise run check` while several agents are running; this machine OOM-killed a run and
  restarted the container, losing three agents.
- `mise run check <pkg>` does run eslint and prettier, despite the turbo output only naming
  `typecheck, test`.
