# Handoff — ADR 0033/0034 client adaptation (B-124 clients stage)

**Branch:** `feat/b124-one-identity-transcript-family`, worktree
`/home/allie/develop/patches-agent-wt/1787794656-2480868`.

## Owned paths

`apps/tui/src/e2ee/**`, `apps/tui/src/app/e2ee-*.ts`, `apps/web/src/e2ee/**`. Nothing else
(`packages/**` frozen, `apps/server/**` owned by another agent, `apps/web/src/routes/**`,
`apps/web/src/components/**`, `apps/tui/src/screens/**` also frozen for me).

## Update from coordinator (mid-task, authoritative)

- Another agent is DELETING `E2EE_UNREVIEWED_DEV_MODE`/`ISOLATED_TEST_ONLY`/its warning copy —
  E2EE ships as an ordinary on-by-default feature. Do NOT add isolated-test warning handling to
  web. DO keep `requiredConversationDisclosure('E2EE_V1')` wherever it already renders.
- `availability.ts` (item 8): flip `SESSION_SETUP_AVAILABLE` to `true` and delete
  `WEB_E2EE_SESSION_UNAVAILABLE_COPY` ONLY if a test actually establishes a session end to end.
  Otherwise leave `false`, say so plainly, do not flip on optimism.

## STATUS: both `mise run check tui`/`check web` TYPECHECK stage is GREEN as of this writing.

Full `mise run check tui` is running in background (`tail -f` / re-run to see result — a prior
handoff claimed node-transcripts.ts was already deleted; it was NOT, and got done in this
session). `mise run check web` not yet run this session — do it next, after `check tui` reports.

## Shared-module rule (ADR 0034 Stage 1)

Every edit to a module present in both `apps/web/src/e2ee/` and `apps/tui/src/e2ee/` lands in BOTH
copies in the same commit: `enrollment.ts`, `history-transfer.ts`, `local-identity.ts`,
`node-transcripts.ts` (deleted, both), `runtime-session.ts`, `runtime.ts`, `session-setup.ts`,
`vault-errors.ts`, `vault-format.ts`. `transports.ts`/`e2ee-transports.ts` is NOT shared (already
platform-specific).

## Design (final, both clients match)

`LocalDeviceIdentity` (`local-identity.ts`, both copies) now holds branded `Verified*` values:
`selfDevice: VerifiedCertifiedDevice`, `ownRoster: VerifiedRosterSnapshot`, plus a new
`ownBundle: LocalSignedPreKeyBundle` (raw `{bundleBytes, deviceSignature}`) re-verified on demand
via `selfPrekeyBundle(identity, oneTimePreKey, nowMs)`. Everything mints via `@patches/crypto`'s
`sign*` then immediately re-verifies via `verify*` — even local/self material (ADR 0033 §3: no
caller-supplied decoding, ever, not even your own).

`enrollment.ts`'s `StoredEnrollment` dropped the old `wire: SubmittedWireMaterial` field entirely
— the wire bytes ARE `identity.selfDevice.certificateBytes`/`identity.ownRoster.rosterBytes`/
`identity.ownBundle.bundleBytes` now (ADR 0033: one transcript family, so no second encoding to
carry alongside). `decodeStoredEnrollment(bytes, nowMs)` / `loadStoredEnrollment(vault, nowMs)`
now take `nowMs` — decode re-runs `verifyMessagingRoot`/`verifyCertifiedDevice`/
`verifyRosterSnapshot` against the persisted raw bytes rather than trusting disk.
`GenerateEnrollmentInput.root` is now `{privateKey, publicKey, createdAtMs}` (was
`{privateKey, publicKey}`) — needed to reconstruct the exact `VerifiedMessagingRoot`
`signDeviceCertificate`'s caller must hold when resuming under an existing (non-bootstrap) root.

## Completed this session, in order

1. **`node-transcripts.ts` deleted, both copies** (`rm`). `chain.ts` (TUI) rewritten: its
   `wireCertificateMatchesTranscript`/`wireRosterMatchesTranscript` are now inlined in
   `chain.ts` itself, built on `@patches/crypto`'s `decodeDeviceCertificateTranscript`/
   `decodeDeviceRosterTranscript` (the ONE canonical decoder) instead of the deleted node-local
   mirror. `apps/tui/test/e2ee-chain-vault.test.ts`'s `buildChain` fixture rewritten to mint via
   `signDeviceCertificate`/`signDeviceRoster` instead of the deleted `encodeCertificateTranscript`/
   `encodeRosterTranscript`.
2. **`claimPrekeyBundles`/`loadPeerRoster` real**, both `apps/web/src/e2ee/transports.ts` and
   `apps/tui/src/app/e2ee-transports.ts`. Chain: `GetIdentityRoot` → `verifyMessagingRoot` →
   `GetDeviceRoster` → `verifyRosterSnapshot` (needs the `certificates` array from that response,
   NOT the single certificate `ClaimPrekeyBundlesResponse` embeds per-bundle) → `ClaimPrekeyBundles`
   → `verifyPreKeyBundle` per returned bundle, matched to the roster already fetched for that
   actor. Added `getDeviceRoster`/`claimPrekeyBundles` to TUI's `E2eeApiSurface` Pick (web's
   `E2eeApiSurface` already exposed the whole Connect client, no Pick needed).
3. **`E2eeSetupUnavailableError` deleted**, both `runtime.ts`. The two throw sites in
   `runtime-session.ts` (both) now throw `E2eeContractError` (the node's `ClaimPrekeyBundles`
   response didn't include a requested fanout target — a real, if rare, failure mode) or a plain
   `Error` (vault didn't persist a just-committed session — internal invariant, not user-facing).
4. **`session-setup.ts` widened prekey ids `u32`→`u64`** in `encodeSetupBlock`/`decodeSetupBlock`
   (both copies), and `establishResponderSession` now builds its own `selfBundle` internally via
   `selfPrekeyBundle` (matching whichever one-time-prekey id the incoming setup block names)
   instead of taking a precomputed bundle from the caller — the caller no longer needs to guess
   which OTP the peer claimed before calling it.
5. **`enrollment.ts` rewritten, both copies**, minting exactly ONE transcript family via
   `sign*`/`verify*`. TUI copy uses `E2EE_DEVICE_STATUS`/`fromDate` from its own `api/wire/*`
   seam (not the raw protobuf-es `E2eeDeviceStatus`, which is what the web copy uses directly) —
   this is the one legitimate ADR 0023-driven import-path difference the two files always had.
6. **Web `transports.ts`'s `bindConversationCreate`** hit a real, unrelated compile break: the
   other agent's ADR 0035 work removed `CreateE2eeConversationRequest.message` from the proto
   (conversation creation no longer carries the first message — the node reserves the id, and the
   first message is a separate `SendEnvelopes`). Fixed minimally: stopped forwarding `message`
   into the wire request; `CreateE2eeConversationInput.message` stays in the seam's TS input shape
   for a future caller to seal envelopes against the returned id and follow up with
   `sendEnvelopes` — wiring that two-step flow end-to-end is out of scope here (no caller exists
   yet; #238 tracks the recipient picker that will need it).
7. **All test files updated to compile against the new API** (this was most of the remaining
   work): `apps/tui/src/e2ee/test-support.ts`'s `testLocalIdentity`, `apps/tui/test/
e2ee-enrollment.test.ts` (material-generation + vault-codec + the two
   claimPrekeyBundles/loadPeerRoster "fails closed" tests, now real-behavior tests against a
   second synthetic peer identity mapped back into wire shapes), `apps/tui/test/
e2ee-runtime.test.ts` (now delegates to `test-support.ts`'s shared identity builder instead of
   duplicating one), `apps/tui/test/e2ee-chain-vault.test.ts`, `apps/web/src/e2ee/
enrollment.test.ts`, `apps/web/src/e2ee/runtime-session.test.ts`, `apps/web/src/e2ee/
transports.test.ts` (same real-peer-identity rewrite as TUI's), `apps/web/src/e2ee/
web-e2ee.test.ts` (`stubIdentity`'s placeholder `Verified*` shapes via structural cast, since
   real branding can only come from the verifiers and this fixture deliberately never runs one).

## `tsc --noEmit` is GREEN for both `@patches/tui` and `@patches/web` as of this commit point.

## Left to do, in order

1. **Run `mise run check tui` then `mise run check web` to completion, one at a time** (OOM risk
   running both). Fix any lint/format/test failures — typecheck passing does NOT mean the actual
   test suites pass; nobody has run them yet this session. Expect at minimum prettier/eslint
   nits on the new code, and possibly real test failures in the rewritten
   `claimPrekeyBundles`/`loadPeerRoster` tests (the wire-shape builder functions
   `wireIdentityRoot`/`wireDeviceRoster`/`wireClaimResponse` in both `e2ee-enrollment.test.ts` and
   `transports.test.ts` were written carefully against the proto field names but never executed).
2. **Item 7 (web `chain.ts` port + wiring)**: NOT STARTED. Port `apps/tui/src/e2ee/chain.ts`
   (now fixed, no `node-transcripts` dependency) to `apps/web/src/e2ee/chain.ts` — it's a
   `@patches/domain`/`@patches/crypto`-only module, no TUI-specific imports except
   `../api/wire/enums.js`/`../api/wire/time.js`/`../api/wire/types.js`, which have direct web
   equivalents (`E2eeDeviceStatus` from `@patches/proto/es` directly, `toDate`/`fromDate` from
   `@bufbuild/protobuf/wkt`, wire types from `@patches/proto/es`). Then call it from web's
   send/inbound paths — brief says web currently has ZERO identity-chain verification calls.
   grep `apps/web/src` for where a peer's roster/certificates get consumed unverified today
   (likely `web-e2ee.ts` or a route — routes/components are FROZEN for me, so if the call site is
   there, only wire the export and leave a clear note for whoever owns that file next, don't
   touch it yourself).
3. **Item 8 (`availability.ts`)**: NOT STARTED. Per coordinator: only flip
   `SESSION_SETUP_AVAILABLE` to `true` if you have an actual passing test that establishes a full
   session end to end (ideally via the now-real `claimPrekeyBundles`/`loadPeerRoster` +
   `session-setup.ts` + `runtime-session.ts` path, TWO real identities exchanging a message and
   decrypting it — closest existing precedent is `apps/web/src/e2ee/runtime-session.test.ts`'s
   ALICE/BOB round-trip tests, which already do this against `buildIdentity`). If you get there,
   delete `WEB_E2EE_SESSION_UNAVAILABLE_COPY` and every reference. If not, leave `false`, say so
   in the final report, and do not flip it on optimism.
4. Once both `check` runs are green, commit (stage only the paths in "Owned paths" above,
   explicit pathspec — this is a shared checkout, another agent could have staged files) and
   report the sha.

## Verification commands

`mise run check web` and `mise run check tui`, one at a time. A `mise run check tui` run was
kicked off in the background at the point this handoff was last written — check
`/tmp/claude-*/*/tasks/*.output` or just re-run it; don't trust a stale in-flight run.

## Learnings this session

- **A prior agent's handoff claiming "node-transcripts.ts deleted" was wrong** — the files were
  still present on disk. Always verify a claimed-done item with `ls`/`git status` before trusting
  it and moving on, especially "deleted" claims in a shared/multi-agent checkout.
- `grep -n` intermittently returned empty output against a file that definitely contained the
  searched string (confirmed via `Read` and `python3` reading the same path) — cause unclear. If
  `grep` reports "no matches" on something you just wrote with `Edit`/`Write`, don't trust it;
  re-verify with `Read` or `python3 -c "print(repr(open(path).read()))"` before concluding the
  file doesn't contain what you expect.
- TUI's e2ee/network code goes through `@patches/client`'s Connect client end-to-end (ADR 0023
  slice 7 flip: `apps/tui/src/api/client.ts` builds `PatchesApi` via `createPatchesApi` from
  `@patches/client`, same SDK the web client uses), NOT `@grpc/proto-loader` directly — despite
  `.claude/rules/tui.md`'s "Proto message fields arrive as null" note, which is about a different/
  older code path (or the server side). TUI wire types (`apps/tui/src/api/wire/types.ts`) are
  re-exports of `@patches/proto/es` (protobuf-es): unset message fields are `undefined` (not
  `null`), `uint64` fields are `bigint`, bytes are `Uint8Array`. Trust the actual wire-seam file
  over an inference from an older doc note when they conflict — confirmed by reading
  `packages/proto/src/generated-es/patches/v1/e2ee_pb.ts` directly.
- Ed25519 signing (`@noble/curves`) is deterministic (RFC 8032 EdDSA) — re-minting a transcript
  from the same fields + private key reproduces byte-identical signature bytes. Not relied upon in
  the final `enrollment.ts` design (raw bytes are persisted directly and re-verified on load, not
  re-derived from fields), but worth knowing.
- `Edit`'s literal-NUL-byte handling: a raw `\x00` byte written into a file via `Write` survives
  fine and matches a `'�'` escape-sequence string content-wise (same character), but
  `Read`'s display of a raw NUL renders as a plain space, which can mislead you into writing a
  literal space into a subsequent `Edit`'s `old_string`/`new_string` by mistake — always check
  `repr()` via `python3` when a control character might be involved, don't trust the terminal
  rendering.
