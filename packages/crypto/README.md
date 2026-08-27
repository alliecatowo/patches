# `@patches/crypto`

**Status: implemented protocol core; production capability disabled; independent review pending.**

Portable TypeScript protocol core for local-node `E2EE_V1` direct messages (see
[ADR 0020](../../docs/decisions/0020-e2ee-direct-messages.md) and the
[research audit](../../docs/research/e2ee-dms.md)). It is a pure library: no protobuf, no
`@patches/domain`, no server imports, no Node built-ins (`types: []` in `tsconfig.json` enforces
this at typecheck time — the package must also run in a browser and, later, React Native). It
exposes byte-level primitives and pure state transitions; wiring them to the wire protocol,
storage, and UI is a separate Phase 13 ship gate owned elsewhere.

## What this package implements

- **`identity-transcript.ts`** — the **single** canonical identity transcript family
  ([ADR 0033](../../docs/decisions/0033-one-e2ee-identity-transcript-family.md)): messaging root
  (T1), device certificate (T2), device roster (T3), and prekey bundle (T4), all under one domain
  separator (`patches-e2ee/identity-v1`) plus a tag byte at a fixed offset, so cross-type confusion
  is impossible by construction. This package owns both encode and decode; there is no second
  encoding of these facts anywhere in the monorepo. Encoder and decoder enforce the same
  constraints (byte-ordered, strictly ascending, no duplicates, positive counters, canonical
  boolean bytes, safe-integer `u64`s), so one set of facts has exactly one valid encoding and a
  decoder fails closed on a wrong domain, version, or tag, or on trailing bytes.
- **`identity.ts`** — account-root Ed25519 identity; per-device Ed25519 signing key + X25519
  agreement key bound together by a root-signed device certificate (closes the audit's critical
  gap #1: the split identities are no longer independently substitutable); signed device rosters;
  signed prekey bundles bound to a certificate digest; a 60-digit, order-independent safety number
  over root public keys sorted by UTF-8 bytes (never `localeCompare`, whose result depends on the
  host's ICU data). Every `verify*` takes raw bytes plus signatures plus an already-verified
  predecessor — there is no input field a caller could put its own decoding into — and returns a
  result branded with a module-private `unique symbol`, so a `Verified*` value cannot be
  constructed outside this module and `initiateX3dh`/`respondX3dh` accept nothing else. Roster
  _chain_ rules (sequence advance, `previousDigest` chaining, no un-revoke, no rollback) live in
  `@patches/domain`'s `assertRosterChain` and are deliberately not duplicated here.
- **`transcript-domains.ts`** — `CRYPTO_TRANSCRIPT_DOMAINS`, the frozen registry of every
  domain-separation string this package signs or digests under. `test/transcript-domains.test.ts`
  reads `src/` from disk and fails if a `patches-e2ee`-prefixed literal is missing from it, so a
  new encoder cannot quietly reuse or omit a prefix. `@patches/domain` keeps the companion
  `DOMAIN_TRANSCRIPT_DOMAINS` for its conversation-level transcripts.
- **`x3dh.ts`** — X3DH-class asynchronous setup (Signal X3DH revision 1) adapted to certified
  split identities. The full transcript — both certified devices, both roster digests, the signed
  prekey, and the optional one-time prekey id/key — is bound into the HKDF `info` and is what the
  initiator signs, so a responder can detect any substitution before deriving secrets. One-time
  prekey use is optional and its absence is surfaced (`usedOneTimePreKey`/
  `consumedOneTimePreKeyId`), never silently claimed as protection it didn't provide.
- **`double-ratchet.ts`** — Signal Double Ratchet revision 4, header-encryption profile: DH
  ratchet, root/sending/receiving KDF chains, bounded skipped-message keys (`MAX_SKIPPED_KEYS`,
  the sole skip bound — its recovery semantics are documented at the constant) indexed by
  `(header key, message number)`, out-of-order delivery, and explicit, versioned state
  serialization (`encodeRatchetState`/`decodeRatchetState`) for an encrypted vault.
  `ratchetEncrypt`/`ratchetDecrypt` never mutate the caller's state — see "State commit contract"
  below.
- **`franking.ts`** — an HMAC-based committing scheme for abuse-report evidence (ADR 0020 §9):
  a sender-chosen opening key binds a commitment to the exact plaintext; the node's own symmetric
  report tag binds a canonical transcript (era, conversation/epoch, message/sender/recipient
  identifiers, accepted-at, commitment, and every accepted ciphertext digest) so that neither the
  commitment nor the tag can be reused for a different message or after the fanout is tampered
  with. This is **not** the paper-proved construction from Grubbs/Lu/Ristenpart's committing-AE
  work — see "What is NOT provided" — it is the product-shaped candidate that ADR 0020 requires
  independent cryptographic review to accept or replace.
- **`zeroize.ts`** — best-effort in-place wiping of secret `Uint8Array`s, used by every module on
  every path that finishes with a secret (success or failure), not only the success path.
- **`vectors/`** — deterministic JSON test vectors generated by this implementation from fixed
  seeds (`scripts/generate-vectors.ts`), replayed byte-for-byte by `src/vectors.test.ts` on every
  test run so an unintentional protocol regression fails CI. `identity-transcripts.json` carries
  the four identity transcripts' field sets, bytes, digests, and signatures for one seed, plus a
  table of hex inputs a conforming decoder must reject. Other packages read the same checked-in
  files through the `./vectors` subpath export
  (`import vector from '@patches/crypto/vectors/identity-transcripts.json' with { type: 'json' }`)
  rather than keeping their own copies.

## Cryptographic profile

- Signal X3DH revision 1, 2016-11-04, adapted to certified split signing/agreement identities.
- Signal Double Ratchet revision 4, 2025-11-04, section 4 encrypted headers.
- X25519 (RFC 7748), strict Ed25519 verification (RFC 8032 / Noble `zip215: false`),
  HKDF-SHA256 (RFC 5869), HMAC-SHA256 chains and franking tags, and XChaCha20-Poly1305 AEAD.
- `@noble/ciphers`, `@noble/curves`, and `@noble/hashes` 2.3.0.

Signal's X3DH and Double Ratchet specifications do not publish test-vector sections. Tests
therefore use the official RFC 7748 and RFC 8032 primitive vectors (`primitives.test.ts`), plus
this implementation's own checked-in deterministic generated transcripts (`vectors/`), inline
deterministic transcript assertions, `fast-check` property tests for ping-pong delivery under
random drop/reorder within the skip-cache bound and fuzzed-ciphertext decryption
(`double-ratchet.property.test.ts`), and replay/malformed-input/state-rollback unit tests.
Cross-implementation vectors and independent review remain open ship gates.

## State commit contract

`ratchetEncrypt` and `ratchetDecrypt` never mutate the caller's state. They return a transition
containing new state and output. The caller must atomically persist that new state (via
`encodeRatchetState`) before sending or acknowledging the output; only then may it call
`disposeRatchetState` on the old state. This avoids advancing counters or reusing key/nonce
material across a crash. `encodeRatchetState`/`decodeRatchetState` are explicit and versioned
(`RATCHET_STATE_FORMAT_VERSION`, independent of the wire protocol version) — never
`JSON.stringify` or log a `DoubleRatchetState` directly; its sequence counters and key material
must only leave memory through this opaque byte form, destined for an encrypted vault.

JavaScript cannot guarantee constant-time execution, prevent garbage-collector copies, or
guarantee zeroization. `zeroize` and `disposeRatchetState` are best-effort exposure reduction, not
a security boundary. Private keys and ratchet state must stay in the encrypted client vault and
must never be logged, included in errors, uploaded to the node, or restored from a recovery
archive.

## Error handling

Every failure mode — malformed input, certificate/roster/prekey rejection, replayed or
too-far-skipped messages, AEAD authentication failure, franking mismatch — throws a subclass of
`E2eeProtocolError` (`errors.ts`) and nothing else. Decrypt/verify functions either return the
full, authenticated output or throw before returning anything; there is no partial-plaintext
return path a caller could misuse. The fuzz property test in
`double-ratchet.property.test.ts` asserts this holds for arbitrarily mutated ciphertext and
header bytes.

## What is NOT provided

This package is protocol core only. It does not implement, and nothing should advertise or enable
`E2EE_V1` merely because this package builds and its tests pass:

- **Multi-device / Sesame.** No per-remote-device session manager, active/inactive session
  selection, simultaneous-initiation convergence, or sender's-own-device fanout.
- **Groups.** No membership epoch, pairwise group fanout orchestration, or group control events —
  only the single-pair Double Ratchet primitive groups would be built from.
- **Storage / vault.** No encrypted local vault, OS-keychain wrapping, or persistence adapter for
  any runtime. `encodeRatchetState`/`decodeRatchetState` produce/consume opaque bytes; where those
  bytes live is a client concern.
- **Server/wire protocol.** No protobuf messages, envelope schema, prekey inventory management,
  rate limiting, or roster distribution — see the companion proto/domain work track for that
  contract.
- **Backup and recovery.** No archive format, recovery-key derivation, or device-link protocol.
- **Reviewed franking.** `franking.ts` is a product-shaped candidate construction, not the
  independently reviewed committing-AE profile ADR 0020 §9/§12.7 requires before any report can be
  trusted as verified evidence.
- **Post-quantum protection.** Classical X3DH/Double Ratchet only; `E2EE_ALGORITHM` is versioned so
  a future PQXDH/triple-ratchet profile can be introduced without reinterpreting old bytes.
