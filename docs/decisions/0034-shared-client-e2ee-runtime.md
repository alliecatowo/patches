# 0034. The duplicated client E2EE runtime is hoisted into `@patches/e2ee-client`, but only after B-124

**Status:** Accepted
**Date:** 2026-08-26

## Context

`apps/web/src/e2ee/` and `apps/tui/src/e2ee/` hold two copies of the same client-side E2EE runtime.
The web copy is a port of the TUI's B-101/B-107 modules, made when `packages/**` was read-only to
the porting agent; the port was never reconciled afterwards. Task B-186 asks whether to hoist the
shared source now, accept the duplication behind a drift-detecting test, or stage it.

### Re-measured, 2026-08-26, at `12b67a5`

The board's numbers were taken before #100's review fixes, #110 and #112. They have **not** moved:
every file is exactly two lines off the board's figure, uniformly, which is a counting artifact
(`diff -u | grep -c '^[-+]'` counts the two `---`/`+++` header lines). Substantively, nothing
changed. Nine modules are co-present in both clients:

| module                | TUI lines | differing lines | of which behavioural                                            |
| --------------------- | --------- | --------------- | --------------------------------------------------------------- |
| `runtime-session.ts`  | 427       | 6               | 0 — one import specifier (`./vault.js` vs `./ratchet-vault.js`) |
| `session-setup.ts`    | 281       | 12              | **0 — the code is identical; all 12 are the doc header**        |
| `local-identity.ts`   | 72        | 9               | 0 — doc header                                                  |
| `runtime.ts`          | 235       | 18              | 1 — the `E2eeSetupUnavailableError` message string              |
| `node-transcripts.ts` | 290       | 18              | 0 — wire-type import specifiers; every constant identical       |
| `vault-format.ts`     | 154       | 52              | 0 — `SealedVaultBlob`/`File` renames; container bytes identical |
| `history-transfer.ts` | 51        | 27              | 0 — doc header                                                  |
| `vault-errors.ts`     | 46        | 21              | platform-genuine (browser/disk copy, TUI-only `VaultLockError`) |
| `enrollment.ts`       | 743       | 113             | **~80 — see below**                                             |
| **total**             | **2,299** |                 |                                                                 |

A tenth site sits outside the board's list: `TypedRatchetVault` (61 lines) is **byte-identical**
between `apps/tui/src/e2ee/ratchet-vault.ts` and the tail of `apps/web/src/e2ee/vault.ts`, as is
the `RatchetSessionVault` interface modulo two comment lines.

Three facts fall out of the measurement that change the answer:

**1. Diff-line count is anti-correlated with interop risk here.** `vault-format.ts` has the
second-highest divergence (52) and _zero_ interop risk: the sealed vault is device-local, never
transferred, never read by the other client, and the divergence is a `Blob`/`File` rename with
identical `PVEAULT` magic, format version, and `DATA_KEY_INFO`. `session-setup.ts` has the highest
interop risk — it frames `E2eeDeviceEnvelope.encrypted_header` for initial X3DH messages, which both
clients must parse from each other — and _twelve_ differing lines, all of them the doc comment. Its
code, including the duplicated `SETUP_MAGIC = "PESH"` / `SETUP_VERSION = 1` at `:41`, is currently
identical. The risk there is entirely prospective, and a line count will never surface it.

**2. Drift is not hypothetical — it has already happened four times, all one-directional.**

- `runtime.ts`: B-132 rewrote `E2eeSetupUnavailableError`'s copy on the web side ("this failure is
  structural, not transient"); the TUI still says "Try again", which is false. B-128 tracks it as
  open. One drift event, already filed as a bug against the copy of the file that did not receive
  the fix.
- `enrollment.ts` carries three more, all security-relevant, all web-ahead-of-TUI:
  - The TUI writes `await input.transport.getCapability().catch(() => undefined)` and
    `await input.transport.getIdentityRoot(input.actorId).catch(() => undefined)`. A _network
    failure_ is therefore read as "the node published no identity root", so the TUI can mint and
    publish a fresh account messaging root on the strength of a request that never completed. The
    web copy lets both throw through — that is exactly the B-131 fix, covered by the
    `identity-root preflight (B-131)` block at `apps/web/src/e2ee/enrollment.test.ts:104`.
  - The TUI has no `publishRootRequestFromRecord`, so a crash between persisting the enrollment
    record and `PublishIdentityRoot` leaves it enrolling a device against an authority the node
    never received. The web copy republishes the identical bootstrap root on resume.
  - The TUI has no `sameBytes(publishedRoot.publicKey, record.rootPublic)` check, so a record that
    sat unsubmitted while another device published a root is enrolled under a root this device does
    not hold, instead of being refused. The web copy refuses.

  `enrollThisDevice` is wired in the TUI (`apps/tui/src/app/e2ee-send.ts:208`), so this is live
  behaviour, not dormant code.

**3. The `enrollment.ts` outlier is drift, not platform divergence.** This is the question B-186
raised, and the answer is unambiguous. There is no Node-keyring or IndexedDB code in `enrollment.ts`
at all — all of that lives behind the `RatchetSessionVault` interface, which is byte-identical.
Of the 113 differing lines, roughly 80 are the three B-131 fixes above and their comments; the
remaining ~30 are the doc header, four user-copy strings ("browser"/"computer"/"machine", a
`(:devices)` hint), and import specifiers that are an ADR 0023 artifact rather than a real
difference: the TUI imports `E2EE_DEVICE_STATUS` and wire types from `apps/tui/src/api/wire/*`,
which is a thin re-export seam over the same `@patches/proto/es` the web imports directly, and
both clients' `toDate`/`fromDate` are the same `@bufbuild/protobuf/wkt` helpers. Nothing in
`enrollment.ts` structurally resists a hoist.

### Test coverage is asymmetric, and only in one direction

Of the nine shared modules, the TUI has tests for exactly one (`vault-format.test.ts`). The web has
`enrollment.test.ts`, `runtime-session.test.ts` (22k, real X3DH/Double Ratchet identities, no mocked
crypto), `vault.test.ts`, and `web-e2ee.test.ts`. Every test that exists for the shared logic tests
the web copy. B-185 deliberately left the TUI mirrors uncovered and deferred the question here.

### What ADR 0033 has already decided

[ADR 0033](./0033-one-e2ee-identity-transcript-family.md) landed 2026-08-25 and settles a large part
of B-186 without any further decision:

- **Both `node-transcripts.ts` copies are deleted** — §1, verbatim: the TUI's and the web's
  `node-transcripts.ts` "are deleted", named in full, one after the other. The three
  duplicated transcript domain separators B-186 flags at `node-transcripts.ts:25-34` go with them —
  §4 collapses six domain constants into one `E2EE_IDENTITY_TRANSCRIPT_DOMAIN` plus a tag enum,
  owned by `@patches/crypto`, guarded by a registry test. B-186 must not propose a competing fix
  for this file; it is spoken for.
- **`runtime.ts`'s `E2eeSetupUnavailableError` is deleted**, not reworded (§Consequences), which
  disposes of the one behavioural divergence in that file and of B-128.
- **`session-setup.ts` changes in both copies**: §2 widens prekey ids to `u64` "everywhere",
  naming "the TUI setup block wrote `u32`" — and the web copy writes `u32` at the same line.
- **`local-identity.ts` and `enrollment.ts` are rewritten in both copies** against the branded
  `Verified*` API and the single transcript family, and §Sequencing already names the web client's
  `e2ee/` tree as the consumer that must follow immediately.
- **§1 gives a placement rule** — "a canonical transcript lives in the package whose verifier must
  re-derive it" — and explicitly rejects `@patches/domain` as the home for identity transcripts on
  layering grounds. B-124's ticket text still says "the hoist into `@patches/domain`"; that phrasing
  is superseded by ADR 0033 and this ADR does not revive it.
- **§7 defines the acceptance test that does not exist yet**: two distinct enrolled devices
  establishing a real session through real RPCs and exchanging a message that decrypts.

So five of the seven files B-186 lists are already scheduled for rewrite, in both copies, by a
change that has an ADR and has not been implemented.

## Decision

**The shared client E2EE runtime is hoisted into a new `@patches/e2ee-client` package — but not
now.** The hoist is sequenced _after_ B-124 lands and after ADR 0033 §7's two-device session test
passes. In the meantime, the duplication is accepted, with two things landing immediately: a
byte-level cross-client guard on the one framing that is genuinely a client-to-client wire
contract, and a straight bug fix for the TUI's enrollment drift.

### Stage 0 — now, no code moved

**(a) The setup-block framing gets a shared golden vector, not a source-identity test.**
`session-setup.ts`'s `encodeSetupBlock`/`decodeSetupBlock` layout — `SETUP_MAGIC` (`0x50 0x45 0x53
0x48`, "PESH"), `SETUP_VERSION`, and the exact writer call sequence — is the only thing in this set
that two _clients_ must agree on byte-for-byte with no server in the middle. It is guarded by a
checked-in vector in `packages/crypto/src/vectors/`, generated by the single generator ADR 0033 §6
establishes, and replayed by both clients' test suites. A vector fails on a `u32`→`u64` widening
applied to one side only; a source-text comparison would not, and would also have to be suppressed
on every file whose divergence is legitimate.

**(b) The TUI's enrollment drift is fixed in place, as a bug, independent of any hoist.** Bringing
`apps/tui/src/e2ee/enrollment.ts` to the behaviour `apps/web/src/e2ee/enrollment.ts` already has and
already tests is not architecture; it is closing three live defects in the copy that missed B-131.

**(c) Nobody writes duplicate TUI tests for the shared modules.** This is a decision, recorded so it
is not re-litigated as a coverage gap: mirroring `runtime-session.test.ts`, `enrollment.test.ts` and
`web-e2ee.test.ts` into `apps/tui` would create a _third_ copy of security-critical material to keep
in sync, and would be deleted by Stage 2. The exception is (a)'s vector replay, which must exist on
both sides precisely because it is a cross-client agreement. B-185's deferral stands and is now
answered.

### Stage 1 — inside B-124, no new scope

B-124 keeps exactly the scope ADR 0033 gave it. What this ADR adds is an acceptance condition:
**every edit B-124 makes to a co-present module is made to both copies in the same commit**, and
Stage 0(a)'s vector is part of B-124's green bar. This is the cheapest possible mitigation — B-124
is already opening all five files on both sides; the cost of the rule is remembering it, not
writing code.

### Stage 2 — the hoist, gated on ADR 0033 §7

Once B-124 is green and two real devices can establish a session and decrypt, the reconciled
proto-free and proto-bound tiers move into a new workspace package, `packages/e2ee-client`
(`@patches/e2ee-client`).

**What moves:** `runtime.ts`, `runtime-session.ts`, `session-setup.ts`, `local-identity.ts`,
`history-transfer.ts`, `enrollment.ts`, `vault-format.ts`, `vault-errors.ts`, the
`RatchetSessionVault` interface and the byte-identical `TypedRatchetVault` facade, plus the TUI-only
`chain.ts` and `group-control.ts` (which the web client will need the moment it grows a real receive
path — O-002).

**What stays in the apps:** everything platform-bound, which is precisely the vault _store_
implementations and the transports — `apps/web`'s IndexedDB store and WebCrypto PBKDF2 wrapping-key
derivation (`vault.ts`, `transports.ts`, `web-e2ee.ts`, `use-e2ee.ts`, `availability.ts`), and
`apps/tui`'s file store, `@napi-rs/keyring` provider, `node:path` file operations and
`recovery-archive.ts` (`vault-store.ts`, `vault-key-providers.ts`, `vault-file-operations.ts`,
`ratchet-vault.ts`'s construction half). The seam between the two halves already exists and is
already identical, which is what makes the split mechanical rather than a redesign.

**What stays duplicated deliberately:** the four user-facing copy strings that differ because the
device differs ("this browser" vs "this computer", the `(:devices)` TUI hint, the vault-error
wording, `VaultLockError` which only a file-backed vault can raise). These become parameters of the
shared modules — a small `ClientCopy` record supplied at construction — not a second module.

**Why a new package and not `@patches/crypto` or `@patches/domain`.** Applying ADR 0033 §1's
placement rule: this code is not a transcript codec and has no verifier that must re-derive
anything. It is client orchestration — an async fanout loop, a mailbox drain, staged-commit
sequencing over a vault, and an enrollment flow that builds protobuf requests.

- `@patches/crypto` is chartered (`packages/crypto/README.md`) as "no protobuf, no
  `@patches/domain`, no server imports, no Node built-ins", enforced by `types: []`, because it must
  run in a browser and later in React Native. `enrollment.ts` builds `EnrollDeviceRequest` and
  `PublishIdentityRootRequest`; `runtime-session.ts` and `history-transfer.ts` import
  `@patches/domain`. Both edges are forbidden there, and forcing them would dissolve the property
  that makes `@patches/crypto` independently reviewable.
- `@patches/domain` depends on `zod` alone and is designed to sit _above_ crypto by injection
  (`SignatureVerifier`, `DigestFunction`). A hard `@patches/crypto` dependency inverts exactly the
  edge ADR 0033 §1 refused to invert, and `@patches/domain` cannot take a `@patches/proto`
  dependency without breaking the layering rule that keeps domain code free of the transport.
- `@patches/e2ee-client` sits in the tier `@patches/client` already occupies: above
  `@patches/crypto` + `@patches/domain` + `@patches/proto`, below the apps, `private: true`,
  consumed by both clients and by React Native later. Establishing it is consistent with the
  existing layering, not an exception to it.

**Layering constraints on the new package**, stated so they are enforceable rather than aspirational:
`tsconfig.json` sets `"types": []` and a `lib` without `DOM`, so neither `node:fs` nor `indexedDB`
typechecks — the same structural guard `@patches/crypto` uses, which is what would have caught the
web/TUI fork mechanically. It never imports Ink, React, TypeORM, or server code. It may import
`@patches/proto` generated types; that edge points away from the server and violates nothing
(`packages/proto` still imports no server code; `packages/domain` still imports no gRPC).

**Publishing.** `apps/tui` already carries `@patches/domain` and `@patches/proto` as
_devDependencies_ and bundles them via `tsup`'s `noExternal: [/^@patches\//]` (P9-003/A-046), because
private workspace packages cannot be resolved from the npm registry. `@patches/e2ee-client` follows
the same pattern, so the published `patches-social` tarball gains no runtime dependency.

## Consequences

**Positive.** The single largest win is not the 2,299 lines — it is that the web client's real test
suite (`runtime-session.test.ts` with real X3DH and Double Ratchet identities, `enrollment.test.ts`
with the B-131 preflight cases) becomes the TUI's test suite too. Today those paths are tested once
and shipped twice. After Stage 2 a drift like B-131's is impossible rather than merely noticed
later. The vector in Stage 0(a) makes the one true client-to-client wire contract structural in the
meantime. Fixing the TUI's enrollment drift now closes three live defects that would otherwise sit
until the hoist.

**Negative.** The duplication persists for the length of B-124, which is a large, breaking,
independently-reviewed change with no committed date; the drift rate measured above (four events)
is the ongoing cost, mitigated but not eliminated by Stage 1's both-copies rule. Adding a workspace
package adds build graph, a `package.json`, a tsconfig, and a README to maintain. The `ClientCopy`
parameterisation is indirection that a reader of a single client will find less obvious than a
literal string. And Stage 2 remains a real move of security-critical code — it is scheduled behind
ADR 0033 §7's session test specifically so that it has a regression net, which it does not have
today.

**Foreclosed.** `@patches/domain` as the home for client E2EE runtime code (already foreclosed for
transcripts by ADR 0033 §1; foreclosed here for the runtime too). Mirroring the web E2EE test suite
into `apps/tui` as a coverage remedy. A whole-file source-identity pinning test as the durable
answer to B-186.

## Alternatives considered

**Hoist now, before B-124.** Rejected on arithmetic, not principle. ADR 0033 rewrites or deletes
five of the seven flagged files in both copies. Hoisting first means editing security-critical
bytes twice — once to move them, once to reconcile them against the new `@patches/crypto` API — and
the first edit would be validated against test vectors ADR 0033 §6 already declares stale, with the
TUI half covered by no tests at all. The purpose of the hoist is to reduce the number of times these
bytes are hand-edited; doing it now increases it.

**Accept the duplication with a whole-file pinning test, as a durable answer.** Rejected because
the test cannot be written honestly. Six of the nine modules legitimately differ — import
specifiers, four platform copy strings, a TUI-only error class, and one intentional B-132 copy fix
the TUI has not taken. Such a test needs a per-file suppression list, and a guard whose failure mode
is "add another suppression" guards nothing. The narrow byte-vector guard survives as Stage 0(a);
the file-level version does not.

**Hoist as part of B-124.** Rejected. B-124 is already a breaking change to reviewed crypto that
destroys every enrolled device, regenerates every cross-client vector, and reshapes
`@patches/crypto`'s public surface. Adding a 2,300-line cross-app package extraction to it would
make the diff unreviewable, which is the opposite of what security-critical work needs. The
both-copies rule gives most of the safety at a fraction of the review cost.

**Hoist only the `SETUP_MAGIC`/`SETUP_VERSION` constants into `@patches/crypto` now.** Tempting and
too small to help: the constants are not what drifts. The framing does — the writer call sequence,
the field widths, the presence flags. Two clients importing the same magic bytes while one writes
`u32` and the other `u64` for the prekey id fail exactly as badly as today, and ADR 0033 §2 is about
to make that specific change. A vector over the encoded bytes covers the whole contract; a shared
constant covers four bytes of it.

**Treat `enrollment.ts` as genuinely platform-divergent and exclude it from the hoist.** Rejected on
the evidence: the divergence is 80 lines of missing bug fixes and ~10 lines of user-facing copy, with
zero platform-specific code — all platform concerns are already behind the byte-identical
`RatchetSessionVault` interface. Excluding it would preserve the single worst instance of the
problem this ADR exists to fix.

## Follow-ups

- **B-195** — Stage 0(b): fix the TUI's enrollment drift (B-131 parity). Live defect.
- **B-196** — Stage 0(a): cross-client setup-block framing vector and its replay on both sides.
- **B-197** — Stage 2: extract `@patches/e2ee-client`. Blocked on B-124 and ADR 0033 §7.
- **B-124** — gains Stage 1's both-copies acceptance condition; its "hoist into `@patches/domain`"
  phrasing is superseded by ADR 0033 §1 and this ADR.
