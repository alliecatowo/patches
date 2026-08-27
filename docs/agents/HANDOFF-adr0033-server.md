# Handoff — adapt apps/server to the new @patches/crypto identity API (ADR 0033)

**Branch:** `feat/b124-one-identity-transcript-family` (worktree `agent/wt-1787793800-2463043`)
**Started:** 2026-08-26

## Task

Per `docs/agents/HANDOFF-e2ee-web.md` "Next steps → 1", adapt `apps/server/src/modules/e2ee/**`
to the new `@patches/crypto` identity-transcript API (ADR 0033), and write the ADR 0033 §5
clean-break migration in `packages/database`. Orchestrator has since expanded scope: also fix the
ADR 0035 (`51a1e2ca`) test fallout in `apps/server/test/e2ee*.ts` — that agent is dead and won't
return.

Do NOT touch `packages/crypto/**` (frozen, green — report if wrong, never edit),
`packages/domain/**`, `apps/web/**`, `apps/tui/**`, `packages/proto/**`,
`packages/database/src/entities/**`, `apps/server/src/modules/messages/**`.

Non-test ADR 0035 remainder (sweep for other read paths that can surface a reserved conversation,
sender-device check moving into `createE2eeConversation`'s transaction, zero-notifications test,
integration tests beyond compile-fixing) is NOT mine — report, don't implement, unless told
otherwise.

## Status: DONE. `mise run check server` and `mise run check database` both green, both

integration test files (`e2ee.integration.test.ts` 27/27, `e2ee-privacy-scan.integration.test.ts`
9/9) pass against local podman Postgres. Committed — see sha at the bottom once added.

## Done so far (all in this worktree, uncommitted)

### ADR 0033 call sites

- `apps/server/src/modules/e2ee/e2ee.codec.ts` — rewritten. Keeps `requireTimestamp`,
  `assertBytesEqual`, `toBytes`, `msFromDate`. Encode/decode Certificate/Roster/PrekeyBundle
  transcript functions now delegate to `@patches/crypto`'s `encode/decodeDeviceCertificateTranscript`,
  `encode/decodeDeviceRosterTranscript`, `encode/decodePreKeyBundleTranscript`, converting
  Date↔ms and `E2eeRosterEntryView`↔`DeviceRosterEntryTranscript`. `CertificateTranscriptFields`
  and `RosterTranscriptFields` gained a required `rootPublicKey: Bytes` field (ADR 0033 §2 binds
  it into T2/T3); `RosterTranscriptFields` also gained `createdAt: Date` (bound into T3).
  `PrekeyBundleTranscriptFields` dropped `agreementPublicKey`/`protocolVersion` (T4 no longer
  carries them — both were already committed to by `certificateDigest`).
- `apps/server/src/modules/e2ee/roster-chain.ts` — `appendRoster` now reads `createdAt` from
  `rosterProto.createdAt` via `requireTimestamp` (was hardcoded `new Date()`), passes
  `rootPublicKey: root.publicKey` into `encodeRosterTranscript`, and persists that same
  `createdAt` explicitly on the entity row (was relying on `@CreateDateColumn` auto-insert-time,
  which would no longer match the signed transcript).
- `apps/server/src/modules/e2ee/device-roster.service.ts` — `enrollDevice`'s
  `encodeCertificateTranscript` call now spreads `rootPublicKey: rootView.publicKey` in.
  `verifyAndSaveSignedPrekey`'s prekey-bundle transcript no longer passes
  `agreementPublicKey`/`protocolVersion`.
- `apps/server/src/modules/e2ee/prekey.service.ts` — same two-field removal in
  `rotateSignedPrekey` and `buildBundle`'s `encodePrekeyBundleTranscript` calls.
- Test files fixed to match: `e2ee.codec.test.ts` (rewritten — dropped the old
  `CERTIFICATE_CONTEXT`/`ROSTER_CONTEXT` disjointness test, since domain separation is now one
  registry, not two constants held apart by a test), `prekey.service.test.ts`,
  `roster-chain.test.ts` (added `rootPublicKey`/`createdAt` throughout `signedRosterProto` and
  the two inline `encodeRosterTranscript` calls).
- New: `apps/server/src/modules/e2ee/transcript-domains.test.ts` — the cross-package registry
  union test ADR 0033 §4 calls for (`CRYPTO_TRANSCRIPT_DOMAINS` ∪ `DOMAIN_TRANSCRIPT_DOMAINS`, no
  overlap, no duplicates within each).
- Confirmed via grep: `e2ee.mapper.ts`, `identity-root.service.ts`, `e2ee-crypto.adapter.ts`,
  `e2ee-fanout.ts`, `group-control.ts`, `e2ee.controller.ts` do NOT call any deleted/renamed
  `@patches/crypto` identity symbol — `e2ee.mapper.ts`'s `decodeCertificateTranscript` call and
  `identity-root.service.ts`'s root-bytes handling are unaffected because the decode function's
  field names didn't change, only gained `rootPublicKey`. **Still need to re-verify this after
  the ADR 0035 edits below, since I haven't re-run a full typecheck since confirming it.**

### NOT done: §6 server-side vector-consumption test (owed per handoff, not the orchestrator's

explicit ask) — asserting the proto/Date adapters over `@patches/crypto/vectors/identity-transcripts.json`
produce the vector's exact bytes, and that `EnrollDevice` accepts a request built from the vector.
Skipped for time/risk (cross-package JSON import under CJS/NodeNext needs checking — see
`apps/server/src/modules/system/server-build.ts`'s comment on why this codebase reads JSON via
`fs.readFileSync` rather than `resolveJsonModule` imports). Flag as a follow-up if not reached.

### Migration

`packages/database/src/migrations/1787800000000-Adr0033IdentityTranscriptCleanBreak.ts` +
`migrations/index.ts` entry. Hand-written (not `db:generate` — no entity diff, pure data
deletion), following the precedent of `RemoveLegacyServerVisibleDms1787660000000` and
`DropOrphanedLegacyMessageTrigger1787670000000`. Deletes, in FK order: `e2ee_mailbox_envelopes`,
`e2ee_logical_messages`, `e2ee_group_control_events`, `e2ee_one_time_prekeys`,
`e2ee_one_time_prekey_key_ids`, `e2ee_signed_prekeys`, `e2ee_device_rosters`,
`e2ee_device_identities`, `e2ee_identity_roots`. Verified against each entity's `@ManyToOne`
`onDelete` (CASCADE vs RESTRICT) that this order never violates an FK. Guards with
`SELECT count(*) FROM e2ee_report_evidence` and throws (does not delete) if non-zero. `down()`
throws unconditionally. `mise run check database` confirmed this against the local podman
Postgres.

Fallout fixed in three **database** integration tests whose generic "round-trip the last
migration" pattern assumed the tip migration is reversible (mine deliberately isn't):

- `packages/database/test/app-meta.integration.test.ts`
- `packages/database/test/phase1-schema.integration.test.ts`
  Both rewritten to assert `undoLastMigration()` rejects with `/irreversible by design/` and that
  `getPendingMigrations()` stays empty afterward (confirmed via TypeORM source,
  `MigrationExecutor.undoLastMigration`, that a thrown `down()` rolls back its transaction and never
  deletes the migrations-table row — state is left consistent).
- `packages/database/test/phase13-e2ee.integration.test.ts` — this one scopes its own
  `dataSource.migrations` to `ALL_MIGRATIONS.slice(ledgerIndex)` to test the
  `AddE2eeIssuedPrekeyLedger` migration's dependency-safe undo in isolation using synthetic
  pre-ledger fixture rows. My migration is now the tip of that slice too, and it deletes those
  same tables — wiping the fixture the very next test in the file depends on. Changed the slice to
  `ALL_MIGRATIONS.slice(ledgerIndex, -1)` (stop one short of the tip) with a comment explaining
  why, and adjusted the undo-loop counter to match. Full-chain coverage of my migration is
  unaffected — `app-meta`/`phase1-schema` both run the complete unscoped chain via the default
  `createDataSource()`.

`mise run check database` was **green** after these three fixes (last run before this handoff
update — re-verify after any further edit to `packages/database/**`).

## ADR 0035 test fallout — done

Fixed in both `apps/server/test/e2ee.integration.test.ts` and
`apps/server/test/e2ee-privacy-scan.integration.test.ts`: added a `reserveAndSend(conversations,
senderActorId, recipientActorIds, senderDeviceId, message, clientRequestId?)` test helper in each
file (they have independently-shaped local helpers, so the function is duplicated per file rather
than shared) that does `createE2eeConversation` (reserve, no message) then `sendEnvelopes` (the
first message), and returns `{ ...sendEnvelopesResponse, conversationId }` — a drop-in replacement
for the old one-shot response shape, since every existing assertion only ever read
`.conversationId`/`.logicalMessageId`/`.frankingTag`/etc., all of which the merged object still
has. Every `createE2eeConversation({ ..., message })` call site now uses it.

Three call sites needed more than the mechanical swap because ADR 0035 moves _where_ a check
runs, not just _when_ the RPC is called:

- "keeps the default runtime policy fail-closed..." — the approval-policy check is inside
  `acceptE2eeLogicalMessage`, which only runs on `SendEnvelopes` now. A reservation always
  succeeds regardless of runtime policy. Rewritten to assert the reservation succeeds, the
  _send_ rejects with 'independent review', and the conversation stays reserved
  (`lastMessageAt` null) with unchanged membership count afterward.
- "rejects a send whose fanout digest does not cover..." and "rejects a v1 envelope that carries
  a separate sealed franking opening" — both used to assert `createE2eeConversation` itself
  rejects on a malformed message; that validation is in `acceptE2eeLogicalMessage` too. Rewritten
  to reserve first (succeeds), then assert the `sendEnvelopes` call rejects.

One unrelated-looking failure surfaced only once these tests actually ran end-to-end:
`enrollAdditionalDevice`'s roster-entries array appended the new device at the end without
re-sorting. The _old_ node-canonical roster encoder never validated ordering; the new
`@patches/crypto` encoder enforces ADR 0033 §2's "entries strictly ascending by deviceId UTF-8
bytes" at encode time, so this test fixture started throwing `MalformedInputError`. Fixed by
sorting the entries array before signing (real clients must do this too — this was a fixture bug
the old encoder simply never caught).

## Verification, final

- `mise run check server` — green (typecheck, unit tests, lint, format).
- `mise run check database` — green.
- `test/e2ee.integration.test.ts` (integration, real Postgres) — 27/27 passing.
- `test/e2ee-privacy-scan.integration.test.ts` (integration, real Postgres) — 9/9 passing.
- Full `mise run typecheck` in `apps/server` — zero errors (confirmed the ADR 0033 fix set didn't
  leave anything else broken).

## Commit

`1fa53ca9` on `agent/wt-1787793800-2463043` (branched from `feat/b124-one-identity-transcript-family`).

## Learnings worth flagging

- A deliberately-irreversible tip migration breaks any test that generically calls
  `dataSource.undoLastMigration()` expecting the _last_ migration to be reversible — there were
  three such tests in `packages/database/test/`, all now fixed. Worth a `/retro` note: the next
  irreversible migration should expect to hit this again unless someone generalizes the test
  pattern.
