# 0033. One E2EE identity transcript family, owned by `@patches/crypto`

**Status:** Accepted
**Date:** 2026-08-25

## Context

E2EE session bootstrap has never worked on any client. `docs/architecture/e2ee.md` §9 names the
reason, and task B-124 restates it: the same identity facts are signed twice, under two different
byte encodings, by two encoders that cannot produce each other's output.

- The **crypto-native** family lives in `packages/crypto/src/identity.ts`
  (`encodeDeviceCertificate`, `encodeDeviceRoster`, `encodeSignedPreKeyStatement`). It is what
  `initiateX3dh` / `respondX3dh` re-verify, via `verifyCertifiedDevice`, `verifyRosterSnapshot`,
  and `verifyPreKeyBundle`.
- The **node-canonical** family lives in `apps/server/src/modules/e2ee/e2ee.codec.ts`, mirrored
  field-for-field in `apps/tui/src/e2ee/node-transcripts.ts` and again in
  `apps/web/src/e2ee/node-transcripts.ts`. It is the only family `EnrollDevice`,
  `PublishDeviceRoster`, `UploadPrekeys`, `GetDeviceRoster`, and `ClaimPrekeyBundles` ever store
  or serve.

Both clients' enrollment flows mint **both** families from the same keys and publish only the
node-canonical one. So a client can fully authenticate a peer's published chain — root
self-signature, roster hash chain, device certificate, prekey bundle signature — and still be
unable to construct the `PreKeyBundle` / `SignedDeviceRoster` values `initiateX3dh` demands,
because those need the peer's _root_ signature over the crypto-native encoding and only the peer's
root private key can mint that. `claimPrekeyBundles` and peer `loadPeerRoster` therefore fail
closed (`E2eeSetupUnavailableError`) rather than half-verify. Nothing else is broken: fanout,
envelope submission, mailbox drain, acknowledgement, and franking all work. Only the first
handshake with a peer is impossible.

Two secondary hazards ride along:

1. **Shared domain separators.** The two encoders originally used the identical prefix strings.
   The 2026-08 audit fix rotated the node's strings and `identity.ts` now exports
   `CERTIFICATE_CONTEXT` / `ROSTER_CONTEXT` _purely_ so `e2ee.codec.test.ts` can assert the two
   sets are disjoint. Two encoders held apart by a test asserting two literals differ is not a
   structural guarantee.
2. **A caller-supplied decoding is representable.** `@patches/domain`'s `verifyDeviceCertificate`
   takes `decodedMatchesTranscript: boolean` — an obligation pushed onto the caller. ADR 0020
   §14.2 ("a verifier never trusts a server-supplied decoding of signed bytes") is satisfied only
   as long as every caller is honest. The client mirrors exist precisely so that boolean can be
   computed honestly, which is three copies of an encoder to satisfy one boolean.

The forcing function is that B-124 blocks B-101's session bootstrap, which blocks P13-016, which
blocks E2EE working at all. Prod is a dev node with roughly one test user.

## Decision

There is **one** identity transcript family. It lives in `@patches/crypto`, which owns both encode
and decode, and every `verify*` re-derives the decoded view from the served bytes itself.

### 1. Where the codec lives, and why not `@patches/domain`

The B-124 ticket and ADR 0020 §14.1 ("canonical transcripts live in `@patches/domain`") point at
`@patches/domain`. That placement is **not** taken here, and §14.1 is amended accordingly.

§14.1's requirement is _one encoder shared by the node and every client_; `@patches/domain` was
the mechanism because it was then the only package all three processes imported. Today
`@patches/crypto` is imported by the node (`e2ee-crypto.adapter.ts`, `e2ee.codec.ts`), the TUI,
and the web client, so either package satisfies the requirement. Three things decide it:

- `@patches/crypto`'s `verifyCertifiedDevice` / `verifyRosterSnapshot` / `verifyPreKeyBundle` are
  the verifiers that must re-derive the decoded view, and `@patches/crypto` deliberately does not
  depend on `@patches/domain` (`packages/crypto/README.md`: "no protobuf, no `@patches/domain`, no
  server imports, no Node built-ins"). Putting the codec in `@patches/domain` would force either a
  new `crypto → domain` edge — inverting the layering, since `@patches/domain`'s whole design
  (injected `SignatureVerifier` / `DigestFunction`) exists so it sits _above_ crypto, not below —
  or a second encoder inside crypto, which is the bug being fixed.
- `@patches/domain`'s views are `Date`-typed; canonical bytes are milliseconds-since-epoch. Today's
  server codec already has to bridge that with `msFromDate`, i.e. a validation-error path _inside_
  a signing function. `@patches/crypto` is uniformly `number`-typed and needs no such bridge.
- `@patches/crypto` already owns `ByteWriter` / `ByteReader`. Hoisting the codec to
  `@patches/domain` would also mean hoisting or duplicating those primitives.

**Placement rule, going forward:** a canonical transcript lives in the package whose verifier must
re-derive it. Identity transcripts (messaging root, device certificate, device roster, prekey
bundle) are `@patches/crypto`. Conversation-level transcripts (`canonicalFanoutTranscript`,
`canonicalGroupControlTranscript`, `canonicalHistoryTransferTranscript`,
`canonicalRecoveryArchiveTranscript`, control envelopes) stay in `@patches/domain`, whose
validators verify them with injected primitives. Neither package holds two encoders for one fact.

`apps/server/src/modules/e2ee/e2ee.codec.ts` keeps only proto/`Date` adaptation
(`requireTimestamp`, `assertBytesEqual`, `toBytes`) and imports the codec.
`apps/tui/src/e2ee/node-transcripts.ts` and `apps/web/src/e2ee/node-transcripts.ts` are deleted.

### 2. The canonical encoding

Written with `@patches/crypto`'s `ByteWriter`: `u8` is one byte; `u32` / `u64` are big-endian
fixed width (`u64` values must be safe integers); `fixed(v, n)` writes exactly `n` raw bytes with
no prefix; `string(s)` writes `u32` UTF-8 byte length then the UTF-8 bytes; `bytes(b)` writes
`u32` length then the bytes. Every field below is mandatory and written in the order given.

Every identity transcript begins with the same three-field prefix:

```
string  "patches-e2ee/identity-v1"      // E2EE_IDENTITY_TRANSCRIPT_DOMAIN
u8      1                               // E2EE_IDENTITY_TRANSCRIPT_VERSION
u8      <tag>                           // E2EE_IDENTITY_TRANSCRIPT_TAGS
```

Tags: `1` messaging root, `2` device certificate, `3` device roster, `4` prekey bundle. One
domain string plus an enumerated tag at a fixed offset makes cross-type confusion impossible by
construction: no two transcript types can ever produce the same bytes, and the prefix is written
by one shared helper so a new transcript type cannot forget to differentiate itself.

**T1 — messaging identity root** (tag 1), signed by the root key itself (`self_signature`) and,
on a planned rotation, additionally by the previous root (`previous_root_signature`) over the same
bytes:

```
<prefix, tag 1>
string  actorId
u32     generation                      // >= 1
fixed   publicKey (32)                  // Ed25519
u64     createdAtMs
```

**T2 — device certificate** (tag 2), signed by the messaging root (`root_signature`):

```
<prefix, tag 2>
string  actorId
string  deviceId
u32     rootGeneration                  // >= 1
fixed   rootPublicKey (32)              // the root that must have signed this
u32     certificateVersion              // E2EE_DEVICE_CERTIFICATE_VERSION
fixed   signingPublicKey (32)           // Ed25519
fixed   agreementPublicKey (32)         // X25519
u32     supportedProtocolVersions.length
string  supportedProtocolVersions[i]    // strictly ascending by UTF-8 bytes
u64     createdAtMs
u64     expiresAtMs                     // > createdAtMs
```

`certificateDigest` = SHA-256 over these bytes.

**T3 — device roster** (tag 3), signed by the messaging root (`root_signature`):

```
<prefix, tag 3>
string  actorId
u32     rootGeneration
fixed   rootPublicKey (32)
u64     sequence                        // >= 1
fixed   previousDigest (32)             // all-zero at sequence 1
u64     createdAtMs
u32     entries.length
  string  entries[i].deviceId           // strictly ascending by UTF-8 bytes
  fixed   entries[i].certificateDigest (32)
  u8      entries[i].active             // 0 or 1, nothing else
  u64     entries[i].addedAtMs
  u8      entries[i].hasRevokedAt       // 0 or 1
  u64     entries[i].revokedAtMs        // exactly 0 when hasRevokedAt = 0
```

`rosterDigest` = SHA-256 over these bytes. The revoked-at pair is fixed width and always present.

**T4 — prekey bundle** (tag 4), signed by the _device's_ Ed25519 signing key:

```
<prefix, tag 4>
string  actorId
string  deviceId
fixed   certificateDigest (32)          // SHA-256 of the device's T2 bytes
u64     signedPrekeyId                  // >= 1
fixed   signedPrekeyPublicKey (32)      // X25519
u64     createdAtMs
u64     expiresAtMs                     // > createdAtMs
```

Both the encoder and the decoder enforce every constraint stated above, so one set of facts has
exactly one valid encoding. A decoder that reads a non-ascending ordering, a duplicate device id
or protocol version, an out-of-range integer, a boolean byte outside `{0,1}`, a non-zero
`revokedAtMs` under `hasRevokedAt = 0`, a wrong domain, a wrong version, a wrong tag, or trailing
bytes fails closed.

Four deliberate differences from today's node-canonical encoding:

- **`rootPublicKey` is bound** into T2 and T3. A transcript now names the exact root key that must
  have signed it, so re-deriving the decoded view is a complete check rather than one that leaves
  "which root?" to the caller. Both are inside `*_bytes`; no protobuf field is added.
- **`createdAtMs` is bound** into T3, which today serves `E2eeDeviceRoster.created_at` as an
  unsigned convenience field.
- **The prekey bundle transcript drops `agreementPublicKey` and `protocolVersion`.** Both are
  already committed to by `certificateDigest`. `protocolVersion` in particular was pinned to the
  empty string as a documented placeholder because a device's advertised versions are not a
  persisted column — a kludge with no reason to survive.
- **The prekey bundle transcript does not bind a roster digest.** This is the root cause of the
  impasse and the one substantive protocol change here. The crypto-native
  `encodeSignedPreKeyStatement` had the _device_ sign over a roster digest, which makes a bundle
  valid for exactly one roster snapshot — every roster change would require every device to
  re-sign every prekey — and is why a node-served bundle could never be lifted into crypto-native
  shape. Roster binding is instead enforced by the verifier: the bundle's `certificateDigest` must
  appear as an **active** entry of an independently verified roster, and the initiator binds the
  roster digest it computed _itself_ into the X3DH handshake transcript it signs. A node that
  serves a stale or substituted `E2eePrekeyBundle.roster_digest` changes nothing, because that
  field is never an input to verification.

**Consequential encoding fixes.** Ordering in a canonical encoder is byte order, never
`String.localeCompare` (ICU-version dependent, so two clients can disagree): `identity.ts`'s
roster sort and `safetyNumber`'s participant sort both move to UTF-8 byte comparison. Prekey ids
are `u64` everywhere — the wire is `uint64`, the node codec wrote `u64`, and `@patches/crypto`'s
X3DH handshake transcript and the TUI setup block wrote `u32`.

The X3DH handshake transcript keeps its own domain (`patches-e2ee-v1/x3dh-transcript`) and its
structure, with two changes: each side's certified device is embedded as
`bytes(certificateBytes)` followed by `fixed(rootSignature, 64)` instead of the deleted
crypto-native `encodeCertifiedDevice`, and the prekey ids widen to `u64`.

### 3. The API shape that makes a caller-supplied decoding unrepresentable

Not "discouraged" — unrepresentable, in two independent ways.

**Verifier inputs contain no decoded fields at all.** Every `verify*` in `@patches/crypto` takes
raw bytes plus signatures plus an already-verified predecessor. There is no field on any input
type into which a caller could place a decoding, honest or otherwise:

```ts
verifyMessagingRoot(input: {
  rootBytes; selfSignature; previousRootSignature?; nowMs;
}): VerifiedMessagingRoot;

verifyCertifiedDevice(input: {
  certificateBytes; rootSignature; root: VerifiedMessagingRoot; nowMs;
}): VerifiedCertifiedDevice;

verifyRosterSnapshot(input: {
  rosterBytes; rootSignature; root: VerifiedMessagingRoot;
  certificates: readonly { certificateBytes; rootSignature }[]; nowMs;
}): VerifiedRosterSnapshot;

verifyPreKeyBundle(input: {
  bundleBytes; deviceSignature; certificateBytes; certificateRootSignature;
  oneTimePreKey?: { id; publicKey }; roster: VerifiedRosterSnapshot; nowMs;
}): VerifiedPreKeyBundle;
```

Each function decodes the bytes with the single codec, checks the signature with strict RFC 8032
semantics over those exact bytes, checks the decoded view against the verified predecessor
(actor id, root generation, root public key, digest membership), checks the validity window
against `nowMs`, and _returns_ the re-derived fields. Callers read fields off the result; they
never supply them.

**The results are opaque, unforgeable tokens.** `Verified*` are branded with a module-private
`unique symbol`, so no code outside `identity.ts` can construct one. `initiateX3dh` /
`respondX3dh` accept only `Verified*` values, so "run X3DH against unverified peer material" does
not type-check.

Branding is a type-level property, so it is backed by a runtime one: X3DH re-runs every check that
can go stale or that binds two objects together — the initiator's device is an active entry of the
initiator's roster, the bundle's certificate is an active entry of the responder's roster, the
device private keys match the certificate's public keys, and every validity window is re-checked
against the caller's `nowMs`. It does not re-verify signatures, because a `Verified*` value cannot
exist without them having been verified over the same bytes it carries.

`verifyRosterSnapshot` takes the served certificates because T3 commits to certificates by digest
only. Every **active** entry must be matched by exactly one supplied certificate whose SHA-256
equals the entry's digest; a supplied certificate matching no entry is rejected; an inactive entry
may be unmatched (the node need not still serve a revoked device's certificate).

Roster _chain_ rules (sequence advances by exactly one, `previousDigest` chains, no drop, no
re-point, no un-revoke, no rollback) stay in `@patches/domain`'s `assertRosterChain` and are
**not** duplicated in `@patches/crypto`; `verifyDeviceRoster`/`RosterRollbackError` are removed
from `@patches/crypto`. One rule, one place.

`@patches/domain`'s `verifyDeviceCertificate(…, { decodedMatchesTranscript })` keeps its shape in
this change. It is now honest by construction rather than by convention — there is exactly one
decoder in the monorepo for the caller to have used — but the boolean remains a caller obligation
and tightening it into an injected `IdentityTranscriptDecoder` (the same pattern as
`SignatureVerifier` / `DigestFunction`) is a named follow-up, deliberately deferred because it
ripples into `apps/web`, which another agent holds.

### 4. Domain-separator hygiene

`CERTIFICATE_CONTEXT`, `ROSTER_CONTEXT`, and `PREKEY_CONTEXT` are deleted from
`packages/crypto/src/identity.ts`, along with `CERTIFICATE_TRANSCRIPT_DOMAIN`,
`ROSTER_TRANSCRIPT_DOMAIN`, and `PREKEY_BUNDLE_TRANSCRIPT_DOMAIN` from the server codec and its
two client mirrors. Six constants become one (`E2EE_IDENTITY_TRANSCRIPT_DOMAIN`) plus a tag
enum, and the disjointness question stops being pairwise.

The server test that asserted two literals differ is replaced by a **registry** test.
`@patches/crypto` exports `CRYPTO_TRANSCRIPT_DOMAINS` and `@patches/domain` exports
`DOMAIN_TRANSCRIPT_DOMAINS`, each a frozen list of every domain-separation string its package
signs or digests under. The test asserts the union has no duplicates, and — reading both packages'
sources from disk — that every `patches-e2ee`-prefixed string literal in either package appears in
its own registry. A seventh encoder cannot quietly reuse a sixth encoder's prefix, and it cannot
quietly stay out of the registry either.

### 5. Migration: clean break, no compatibility shim

Prod is a dev node with roughly one test user, and session bootstrap has **never** succeeded on
any client. A session can only exist if some device successfully claimed a peer bundle, which is
exactly what has always failed, so no `E2EE_V1` session, ratchet state, or readable envelope
exists anywhere — there is no plaintext to preserve and no installed base of signed material to
stay compatible with. Under [ADR 0030](./0030-pre-alpha-consolidation-policy.md) that is a clean
break, and a dual-read shim would be compatibility code for data that does not exist.

Old-encoding rows would fail closed in the new decoder (wrong domain string), leaving the node
serving material every client rejects — worse than serving none. So a migration deletes them, in
foreign-key order: `e2ee_mailbox_envelopes`, `e2ee_logical_messages`,
`e2ee_group_control_events`, `e2ee_one_time_prekeys`, `e2ee_one_time_prekey_key_ids`,
`e2ee_signed_prekeys`, `e2ee_device_rosters`, `e2ee_device_identities`, `e2ee_identity_roots`.

Not deleted: `conversations` and their `security_mode` (a conversation survives re-enrollment),
`e2ee_node_franking_keys` (node-owned, encoding-independent), and `e2ee_report_evidence*` (there
is none, and evidence rows are never destroyed by a schema change as a matter of policy — if any
exists, the migration must fail loudly rather than delete it).

Every enrolled device row is therefore invalidated, not migrated. Each client re-enrolls on next
start: it mints a fresh device id, certificate, roster at sequence 1, and prekey inventory, and
publishes a fresh messaging root. Clients detect the condition the way they already detect a wiped
node — their enrolled device is absent from the served roster — and take the existing re-enroll
path. Local ratchet vaults hold state keyed by peer device ids that no longer exist; the vault is
wiped as part of re-enrollment rather than left holding unopenable sessions. The migration is
irreversible by design; `down()` throws.

No protobuf message changes, no field is removed, and no field number is reused. The transcripts
are `bytes` fields whose contents the schema deliberately leaves to the implementation.

### 6. Cross-client test vectors

`packages/crypto/scripts/generate-vectors.ts` is the only generator, from fixed seeds, and its
output is checked in under `packages/crypto/src/vectors/`:

- **`identity-transcripts.json`** (new) — for one deterministic seed: the root, certificate,
  roster, and prekey-bundle field sets, each with its hex transcript bytes, hex digest, and hex
  signature, plus a small table of negative cases (wrong tag, wrong version, non-ascending
  entries, trailing bytes) as hex inputs a decoder must reject.
- **`x3dh-handshake.json`** and **`double-ratchet-session.json`** — regenerated, because the
  handshake transcript now embeds the new certificate bytes and widened prekey ids, which changes
  the derived root key and therefore every ratchet output downstream.

Consumers, all reading the same checked-in file rather than a copy: `packages/crypto`'s
`vectors.test.ts` replays every vector byte-for-byte; the server suite asserts that its proto/Date
adapters over the vector's field set produce the vector's exact bytes and that `EnrollDevice`
accepts a request built from the vector; the TUI's enrollment test asserts its generated
enrollment reproduces the vector's bytes for the vector's seed. `@patches/crypto` gains a
`./vectors` subpath export so all three read one file instead of three copies of a fixture.

### 7. Definition of done

A server integration test in which two distinct enrolled devices establish a session through the
real RPCs and exchange a message that decrypts: `EnrollDevice` → `ClaimPrekeyBundles` → X3DH →
ratchet encrypt → `SendEnvelopes` → `ListMailboxEnvelopes` → decrypt, with franking verification
intact. Anything short of that means the two families are still not unified.

## Consequences

**Positive.** Session bootstrap becomes possible at all: a client that authenticates a peer's
published chain now holds exactly the values `initiateX3dh` accepts. One encoder replaces four
(server, TUI, web, crypto) plus a second family, so an interop divergence becomes a compile error
or a vector failure instead of a silent inability to talk. `E2eeSetupUnavailableError` and the
fail-closed branches in both clients' transports are deleted rather than reworded (B-128's
"try again" copy problem disappears with the condition). The verifier API makes ADR 0020 §14.2
structural rather than a convention every caller must honour. Six domain-separator constants and
a pairwise disjointness assertion become one constant, one tag enum, and a registry test.

**Negative.** This is a breaking change to reviewed crypto, so the checked-in vectors are no
longer the ones the 2026-08 audit read; ADR 0020 §12's independent-review gate now covers the new
transcripts, and this ADR does not discharge it. Every enrolled device and every mailbox row is
destroyed. `@patches/crypto`'s public surface changes shape (branded verified types), which
ripples into every enrollment and chain-verification call site in both clients. ADR 0020 §14.1 is
amended, so "canonical transcripts live in `@patches/domain`" is no longer literally true and a
future reader needs the placement rule in §1 above to know where to look. And the prekey bundle
no longer carries a signed roster binding, which is a deliberate weakening of what the _device
signature_ covers, compensated by verifier-enforced roster membership and by the initiator's own
signed handshake transcript — a reviewer should check that trade specifically.

**Sequencing.** `apps/web/src/e2ee/**` is held by another agent during this change and is the one
consumer left on the old API. It does not compile against the new `@patches/crypto` until its
mirror is deleted and its enrollment mints one family; that update must follow immediately, using
the landed vectors.

## Alternatives considered

**Hoist the codec into `@patches/domain`, as ADR 0020 §14.1 and the B-124 ticket say.** Rejected
on the layering grounds in §1: it either inverts `crypto`/`domain` or leaves a second encoder in
`@patches/crypto`, which is the defect. §14.1's actual requirement — one encoder for all three
processes — is met by `@patches/crypto`.

**Keep the crypto-native family and teach the node to store it.** The node would have to serve a
second set of `*_bytes` per object, doubling storage and giving an attacker two transcripts per
fact to find a disagreement between. It also does not work for prekey bundles, whose crypto-native
statement binds a roster digest the device would have to re-sign on every roster change.

**Keep both families and translate between them.** Impossible in the direction that matters:
translation needs the peer's root signature over the target encoding, and only the peer's root
private key can produce it. That impossibility is the bug.

**Drop re-verification from X3DH and take pre-verified plain objects.** Smallest diff, and wrong:
it makes "caller forgot to verify" a silent security failure rather than a type error, which is
the opposite of §14.2.

**Dual-read compatibility: accept old-domain bytes for a grace period.** Rejected under ADR 0030.
There is no data to be compatible with — no session has ever been established — so the shim would
be untested code on a security path, guarding an empty set.

**Keep `previousDigest`-style roster binding inside the prekey bundle signature.** Rejected: it
forces every device to re-sign every prekey on every roster change of its own account, which turns
an ordinary device addition into a fleet-wide re-signing event, and it is unimplementable
asynchronously (the device may be offline when the roster advances).
