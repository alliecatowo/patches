# End-to-end encrypted direct messages

**Status:** Verified architecture research; no production wiring
**Verified:** 2026-08-19

This note audits the unfinished, uncommitted `packages/crypto/**` spike and its related
`pnpm-workspace.yaml` / `pnpm-lock.yaml` edits. It does not approve that code for production.
The owner explicitly authorized an end-to-end encrypted DM architecture on **2026-08-18**;
[ADR 0020](../decisions/0020-e2ee-direct-messages.md) records the resulting decision.

## 1. Primary sources

All protocol claims below were checked against primary specifications or upstream source:

- Signal, [The X3DH Key Agreement Protocol, revision 1 (2016-11-04)](https://signal.org/docs/specifications/x3dh/).
- Signal, [The Double Ratchet Algorithm, revision 4 (2025-11-04)](https://signal.org/docs/specifications/doubleratchet/).
- Signal, [The Sesame Algorithm, revision 2 (2017-04-14)](https://signal.org/docs/specifications/sesame/).
- Signal, [The PQXDH Key Agreement Protocol, revision 3, updated 2024-01-23](https://signal.org/docs/specifications/pqxdh/).
- Grubbs, Lu, and Ristenpart, [Message Franking via Committing Authenticated Encryption](https://eprint.iacr.org/2017/664.pdf), CRYPTO 2017.
- Noble 2.3.0 upstream source and documentation:
  [curves](https://github.com/paulmillr/noble-curves/tree/2.3.0),
  [ciphers](https://github.com/paulmillr/noble-ciphers/tree/2.3.0), and
  [hashes](https://github.com/paulmillr/noble-hashes/tree/2.3.0).
- IETF, [RFC 7748: Elliptic Curves for Security](https://www.rfc-editor.org/rfc/rfc7748),
  [RFC 8032: Edwards-Curve Digital Signature Algorithm](https://www.rfc-editor.org/rfc/rfc8032),
  and [RFC 5869: HKDF](https://www.rfc-editor.org/rfc/rfc5869).

The Signal documents specify protocols, not a claim that a new implementation is correct.
Noble supplies primitives, not X3DH, Double Ratchet, Sesame, safe persistence, device UX, or
message franking as a finished protocol.

## 2. Preserved spike snapshot

The audited snapshot consists of 12 untracked files under `packages/crypto/**`, the three noble
2.3.0 catalog additions in `pnpm-workspace.yaml`, and the generated lockfile changes. A SHA-256
over the sorted `sha256sum` manifest of those files was:

```text
8b1dfecf5c427d3c294ca37a7c8dfedc9259db36b2521c79c7af04097efb472c
```

No spike, manifest, workspace, or lockfile bytes were changed by this audit. The lockfile changes
are consistent with adding `@patches/crypto` and `@noble/{ciphers,curves,hashes}@2.3.0`. The wider
`jsdom` / `whatwg-url` snapshot churn comes from satisfying an existing optional peer on
`@noble/hashes`; the extra Vite/Vitest resolution is the crypto workspace's `tsup`/esbuild path.
Nothing in that diff is production approval.

The read-only command `mise exec -- pnpm --filter @patches/crypto typecheck` currently fails first
at `packages/crypto/src/session.ts:334` because a single-quoted string contains an unescaped
apostrophe. No build was run: `tsup.config.ts` has `clean: true`, and this audit was required not to
overwrite the spike. Static inspection also shows that its configured `src/index.ts` entry and all
`src/**/*.test.ts` files are absent.

## 3. What the spike gets right

These are useful design inputs worth preserving:

- Signing and Diffie-Hellman use separate Ed25519 and X25519 keypairs. Separation is viable if a
  certificate and signed transcript bind both keys to the same account and device.
- The X3DH-like calculation has the expected three DH terms and optional fourth one-time-prekey
  term. It prepends the X25519 `F` bytes, uses a zero HKDF salt, deletes the ephemeral secret and DH
  outputs on the initiator, and includes identity material as AEAD associated data.
- A one-time prekey is optional exactly as X3DH specifies, and exhaustion is surfaced rather than
  falsely reported as one-time-prekey protection.
- Messages receive unique symmetric-chain keys; old chain keys and used message keys are wiped on
  a best-effort basis. Out-of-order derivation and retained skipped keys have explicit bounds.
- XChaCha20-Poly1305 is used as AEAD, with key and nonce derived from a single-use message key and
  canonical associated data. Double Ratchet explicitly permits deriving an independent AEAD key
  and nonce from each message key.
- The server-facing franking goal is correct: a report should disclose authentic content without
  giving the node the ability to read unreported messages, and public per-message signatures are
  deliberately avoided to preserve third-party deniability.
- Byte encodings are length-prefixed and ordered rather than relying on JSON canonicalization.
- The code explicitly states that JavaScript wiping is best-effort and that the spike lacks
  post-compromise healing and server/multi-device protocols.

Those properties make the spike a valuable prototype. They do not make it a secure messaging
protocol.

## 4. Stop-ship protocol findings

### 4.1 Critical: the claimed initiator identity is not authenticated

X3DH uses one Curve25519 identity key in the authenticated DH calculations. The spike separates
the Ed25519 identity from the X25519 identity but does not bind them:

- the signed-prekey signature covers only its id, X25519 public key, and timestamp;
- it does not cover the long-term X25519 identity, actor id, device id, version, or expiry;
- the initiator's Ed25519 public key is copied into the handshake and associated data but the
  initiator never proves possession of its Ed25519 private key; and
- there is no account/device certificate or cached-roster check.

An attacker can therefore generate its own X25519 identity and ephemeral keys while naming another
person's Ed25519 identity and device id. The responder derives a valid secret with the attacker's
X25519 key and records the victim's claimed Ed25519 identity. A future safety number over only the
Ed25519 key would bless the wrong session. Production must certify both per-device public keys,
verify the certificate/roster, and sign the complete prekey bundle transcript.

### 4.2 Critical: this is not the Double Ratchet

`ratchet.ts` is one symmetric KDF chain per direction. The root is discarded at setup and no fresh
DH output is ever mixed in, so compromise of current state compromises all future messages in that
session. There is no post-compromise healing.

Signal's Double Ratchet keeps `DHs`, `DHr`, `RK`, `CKs`, `CKr`, `Ns`, `Nr`, and `PN`; each header
contains the sender's current DH ratchet public key, `PN`, and `N`; skipped keys are indexed by
`(ratchet public key, message number)`. The spike header has only a session id, sender device, and
one counter, and its skipped map is keyed only by counter. Adding a periodic DH call would not be
enough: state, header, initialization, skipped-key indexing, and persistence all need redesign.

The revision 4 header-encryption profile should be used so the node does not learn ratchet keys and
counters after session establishment. Initial X3DH material and routing metadata remain visible.

### 4.3 High: no asynchronous multi-device session manager

There is one session between two device ids, no device roster, no active/inactive session handling,
no simultaneous-initiation convergence, no retry rules, and no copies to the sender's other devices.
Sesame exists for exactly these cases and warns that backup restore or erased state creates orphaned
sessions. Production needs Sesame-style per-remote-device records and bounded stale-session
retention, not one actor-to-actor session.

### 4.4 High: unsafe key lifecycle and unauthenticated state transitions

- The responder holds only one signed prekey, so rotation immediately makes delayed initial
  messages fail despite comments saying an old key should be retained temporarily.
- One-time private keys are not consumed by an atomic "authenticate first ciphertext, persist
  session, then delete key" operation. A caller comment is not a replay defense.
- Bundle timestamps, ids, optional-field pairs, and expiry are not fully validated. The timestamp
  is self-asserted and has no freshness policy.
- Session state advances and message keys are destroyed before AEAD authentication succeeds. A
  forged envelope can burn keys or desynchronize the receiver unless decryption is staged and
  committed transactionally only after authentication.
- No durable state store exists. A crash or rollback between deriving a send key, persisting the
  next state, and transmitting can reuse key/nonce material. This is a protocol failure, not a
  local-storage polish issue.
- Counter exhaustion and cross-session/global skipped-key resource limits are not designed.

### 4.5 High: the franking construction is an unaudited sketch

The code uses keyed BLAKE2b with a sender-chosen opening as a commitment, then a node-keyed BLAKE2b
tag over a small metadata tuple. It is not the construction proved by the cited paper and has no
proof or vectors for receiver binding, sender binding, or multiple openings. The paper specifically
shows that ordinary AEAD integrity and receiver binding are insufficient: a malicious sender must
also be unable to deliver readable abuse whose report opening later fails.

The node tag also omits ciphertext, recipient/fanout digest, sender device, protocol version, and
franking-key era. Key rotation and canonical report serialization are unspecified. The prototype
captures the product requirement, but its exact construction is stop-ship until independent
cryptographic review selects and validates a committing-AE/franking profile.

Franking can prove only that disclosed content was accepted by this node under the bound metadata.
It cannot prove that a report includes the whole context. The report UI and moderator UI must say
that surrounding evidence is reporter-selected.

### 4.6 High: recovery, revocation, groups, and migration do not exist

The spike has no encrypted local vault, backup format, identity recovery, device-link protocol,
revocation, stale/lost-device behavior, group membership epochs, bounded fanout, or coexistence
model for existing server-visible conversations. Each is part of the security protocol because it
changes who holds decryption keys or what a client claims is protected.

## 5. Noble 2.3.0 API audit

The workspace and lock resolve all three noble packages to 2.3.0. Their Node engine floor is
20.19, compatible with the repository's Node 24 target. The package APIs are ESM-only and require
`.js` subpath imports; the spike's imports follow that rule.

| Spike use                                           | Noble 2.3.0 behavior                                                                   | Audit result                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `x25519.utils.randomSecretKey()` / `getPublicKey()` | Current names and 32-byte keys                                                         | Correct API                                                                       |
| `x25519.getSharedSecret()`                          | Rejects the complete low-order input set before the ladder and rejects all-zero output | Correct; preserve opaque error mapping                                            |
| `ed25519.sign()` / `verify()`                       | Current argument order; verify defaults to permissive `zip215: true`                   | Use `{ zip215: false }` for strict RFC 8032 protocol signatures                   |
| `randomBytes()`                                     | Uses `globalThis.crypto.getRandomValues`; React Native may need a reviewed polyfill    | Correct where the runtime gate is tested                                          |
| `hkdf(sha256, ikm, salt, info, len)`                | `info` is `Uint8Array`, not `string`; `undefined` salt becomes HashLen zero bytes      | Spike's string call is incompatible; encode domain labels once as canonical bytes |
| `blake2b(input, { dkLen, key })`                    | Current keyed-hash API                                                                 | API-correct, but not proof that the custom franking commitment is secure          |
| `xchacha20poly1305(key, nonce, aad)`                | 32-byte key, 24-byte nonce, ciphertext with 16-byte tag                                | Correct API and suitable for single-use derived message keys                      |
| `clean()`                                           | Fills supplied typed arrays with zeroes                                                | Useful hygiene only; JS/GC copies remain                                          |

The spike's comment that Safari Web Crypto Ed25519 uses randomized signatures was not supported by
the primary sources reviewed and must not be used as a library-selection argument.

Upstream reports self-audits at 2.2.0 (April 2026), plus independent audits of earlier releases:
curves 1.6.0, ciphers 1.0.0, and hashes 1.0.0 for the relevant broad areas. That is useful evidence,
not an independent audit of the exact 2.3.0 release or of Patches' composition. Upstream also
plainly warns that JIT/GC JavaScript cannot guarantee constant-time execution or reliable
zeroization. A Patches-specific external review remains a hard ship gate.

## 6. Other implementation defects found by inspection

These are not the architecture decision, but they prevent treating the snapshot as a working spike:

- `src/index.ts` is configured as the build entry but absent.
- There are no tests despite `vitest` accepting an empty suite.
- `session.ts:334` is a syntax error, and the HKDF string/bytes mismatch is a later type/runtime
  error once parsing is fixed.
- `fromHex()` uses `parseInt()` on two-character chunks and therefore accepts partial chunks such
  as `0g`; a strict decoder must reject every non-hex character.
- Bundle decoding accepts non-finite/negative timestamps and treats any one-time-prekey flag other
  than `1` as absent.
- Failed decryption leaves copied plaintext framing in GC-managed memory and permanently consumes
  state. Best-effort wiping cannot compensate for a non-transactional state machine.
- The root KDF concatenation allocates another copy of all DH outputs that is not wiped.
- A root-derived `sessionId` is called safe to log. Crypto/session identifiers and identity keys
  should not be logged; they are correlation metadata even when they do not reveal plaintext.

## 7. Production conclusions

1. Preserve the spike as research, but do not patch it incrementally into production. Rebuild the
   protocol state and wire format around certified devices, X3DH initialization, full Double
   Ratchet with header encryption, and Sesame-style multi-device management.
2. Keep noble 2.3.0 behind a narrow primitive adapter as a candidate for the portable TypeScript
   implementation. Pin and review release provenance; do not equate a primitive library audit
   with a protocol audit.
3. Require pairwise per-device fanout, including the sender's other devices. For groups of at most
   eight members, pairwise fanout is simpler and safer than introducing a sender-key or MLS layer.
4. Make message franking mandatory, but select the exact committing construction only through
   cryptographic review. A public sender signature is not an acceptable substitute.
5. Never restore live ratchet counters or one-time-prekey state from backup. Restore identity and
   history, register a fresh device, and establish fresh sessions.
6. Keep server-visible and E2EE conversations as immutable, visibly distinct modes. Existing
   plaintext is never retroactively protected by copying it into ciphertext.
7. Classical X3DH/Double Ratchet does not provide post-quantum protection. The envelope and KDF
   profiles must be versioned for a future PQXDH/triple-ratchet profile, and Patches must make no
   post-quantum claim for v1.
8. E2EE does not authorize federated DMs. All key discovery, envelopes, reports, and delivery in
   ADR 0020 remain within one node.

## P13-003 implementation notes (2026-08-19)

This section records what `packages/crypto/**` implements as of task P13-003, against the stop-ship
findings in §4 above. It does not change the production conclusions in §7 or any ADR 0020 ship
gate: the package is still protocol core only, disabled outside isolated test nodes.

### Findings closed

- **§4.1 (unauthenticated initiator identity).** `identity.ts` now certifies both the Ed25519
  signing key and the X25519 agreement key together in one root-signed `DeviceCertificate`
  covering user id, device id, both public keys, generation, and a validity interval. `x3dh.ts`'s
  handshake transcript includes both certified devices in full (`encodeCertifiedDevice`), both
  signed roster digests, the signed prekey, and the optional one-time prekey id/key; the initiator
  signs that whole transcript with its certified Ed25519 device key, and `respondX3dh` re-derives
  and verifies the same transcript before deriving secrets. An attacker can no longer name a
  victim's Ed25519 identity while supplying its own X25519 key: `verifyCertifiedDevice` rejects
  any certificate not signed by the claimed root, and `respondX3dh` rejects any handshake whose
  initiator device is absent from the presented (roster-verified) roster.
- **§4.2 (not the Double Ratchet).** `double-ratchet.ts` implements the Signal revision-4
  header-encryption state machine: retained root key, sending/receiving chain keys, a DH ratchet
  step (`dhRatchet`) that mixes fresh X25519 output into the root chain on every direction change,
  header keys (current + next, both directions) encrypted with XChaCha20-Poly1305, and skipped
  keys indexed by `(sha256(header key), message number)` with two independent bounds (`MAX_SKIP`
  per gap, `MAX_SKIPPED_KEYS` total retained). Post-compromise healing now holds: compromising a
  snapshot of `DoubleRatchetState` does not compromise ciphertexts sent after the next DH ratchet
  step in either direction, once an uncompromised party contributes fresh key material.
- **§6 build/inspection defects.** The package builds, typechecks, and has full test coverage
  (`build`/`typecheck`/`eslint`/`test` all green — see Verification below); `src/index.ts` exports
  every public module; `fromHex` in `codec.ts` already rejected malformed input (`/^[0-9a-f]*$/i`
  plus an even-length check) by the time of this task, so that defect was already closed.

### New in this task (beyond closing the audit findings)

- **`franking.ts`** — a from-scratch, byte-level committing scheme: a random sender-chosen opening
  key HMAC-binds a commitment to the exact plaintext; the node's own HMAC report tag binds a
  canonical transcript (franking-key era, conversation id, membership epoch, logical message id,
  sender actor/device, recipient fanout digest, accepted-at, commitment, and every accepted
  ciphertext digest). `verifyFrankingReport` composes both checks and throws `FrankingError` (a
  new `E2eeProtocolError` subclass) the instant any check fails — forged plaintext, forged opening,
  a disclosed commitment that doesn't match the accepted transcript, a forged/truncated node tag,
  and a transcript replayed against a different logical message are all covered by
  `franking.test.ts`. This is still a **candidate** construction pending the independent
  cryptographic review ADR 0020 §9/§12.7 requires — the audit's §4.5 finding that a
  committing-AE/franking profile needs external selection remains open. What changed is that the
  candidate is now a real HMAC-based commitment/tag design with negative tests, not the prior
  keyed-BLAKE2b sketch this ADR already rejected.
- **`zeroize.ts`** — the prior `wipe()` helper (previously duplicated inside `primitives.ts`) is
  now its own module with a documented limits section; every call site in `double-ratchet.ts` and
  `x3dh.ts` was moved to it.
- **Explicit, versioned ratchet-state serialization.** `encodeRatchetState`/`decodeRatchetState`
  give a canonical byte encoding of `DoubleRatchetState` (own `RATCHET_STATE_FORMAT_VERSION`,
  independent of the wire protocol's `E2EE_VERSION`) for an encrypted vault, including the
  skipped-key cache. Decoding rejects an unknown format version and a skipped-key count above
  `MAX_SKIPPED_KEYS` before allocating anything proportional to an attacker-controlled count, so a
  corrupted vault entry fails closed rather than reconstructing unbounded state.
- **Deterministic generated vectors + property/fuzz tests.** `scripts/generate-vectors.ts` (not
  part of the build; run deliberately and reviewed on protocol changes) produces
  `src/vectors/*.json` covering an X3DH handshake, an 8-message out-of-order Double Ratchet session
  with its final serialized receiver state, and a franking commitment/tag pair, all from
  fixed seeds. `src/vectors.test.ts` recomputes every one of those outputs from the same seeds on
  every test run. `src/double-ratchet.property.test.ts` adds `fast-check` properties: random
  drop/reorder of up to 30 messages always decrypts every delivered message to its original
  plaintext, and mutating a single byte of either the header ciphertext or the body ciphertext
  always throws an `E2eeProtocolError` subclass and never advances the receiver's counters.

### What the wire/domain contract agent must align with

This task did not touch `packages/proto` or `packages/domain`; the concurrent contract work should
treat the following as the byte-level shapes it wraps, not renegotiate them without a corresponding
crypto-package change:

- `DeviceCertificate`/`CertifiedDevice`/`DeviceRoster`/`SignedDeviceRoster`/`PreKeyBundle` in
  `types.ts` are the certificate/roster/prekey shapes; roster verification is monotonic-sequence +
  digest-chain based (`verifyDeviceRoster`), not a single "latest wins" check.
- `X3dhHandshake`/`X3dhSecrets` in `types.ts` are the initial-message shape; `initiateX3dh`/
  `respondX3dh` in `x3dh.ts` are the only supported entry points (no raw DH-output access).
- `EncryptedRatchetMessage` (`{ encryptedHeader, ciphertext }`) is the on-wire shape of every
  post-setup Double Ratchet message; there is no separate plaintext-header variant.
- `encodeRatchetState`/`decodeRatchetState` bytes are vault-internal only and must never appear on
  the wire or in a server envelope.
- Franking wiring is not yet decided: this task exposes `commitFranking`/`verifyFrankingCommitment`
  (sender/recipient side) and `createNodeReportTag`/`verifyNodeReportTag`/`verifyFrankingReport`
  (node side) as pure functions over caller-supplied byte fields. Where the opening key and
  commitment travel inside the inner AEAD plaintext, and how `FrankingReportTranscript`'s fields
  map onto the logical envelope in ADR 0020 §8, is domain/proto-layer design this task deliberately
  left open.
