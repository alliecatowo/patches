# `@patches/crypto`

**Status: implemented protocol core; production capability disabled; independent review pending.**

Portable TypeScript protocol core for local-node `E2EE_V1` direct messages. It implements:

- account-root Ed25519 certified device Ed25519/X25519 identities;
- signed monotonic device-roster digests and root-key safety numbers;
- X3DH-class asynchronous setup bound to both certified devices, both roster digests, the
  signed prekey, and the optional one-time prekey;
- the Signal Double Ratchet revision 4 header-encryption profile, including DH/root/send/receive
  ratchets, bounded skipped keys, replay/out-of-order handling, and pure state transitions for
  transactional persistence.

The package does not implement server routing, a local vault, Sesame session management, groups,
recovery, or the independently reviewed franking construction. Those are separate Phase 13 ship
gates. Nothing should advertise or enable `E2EE_V1` merely because this package builds.

## Cryptographic profile

- Signal X3DH revision 1, 2016-11-04, adapted to certified split signing/agreement identities.
- Signal Double Ratchet revision 4, 2025-11-04, section 4 encrypted headers.
- X25519 (RFC 7748), strict Ed25519 verification (RFC 8032 / Noble `zip215: false`),
  HKDF-SHA256 (RFC 5869), HMAC-SHA256 chains, and XChaCha20-Poly1305.
- `@noble/ciphers`, `@noble/curves`, and `@noble/hashes` 2.3.0.

Signal's X3DH and Double Ratchet specifications do not publish test-vector sections. Tests therefore
use the official RFC 7748 and RFC 8032 primitive vectors plus checked-in deterministic generated
X3DH/ratchet transcripts, shuffled-delivery property checks, replay/malformed-input tests, and
state-rollback assertions. Cross-client vectors and independent review remain open ship gates.

## State commit contract

`ratchetEncrypt` and `ratchetDecrypt` never mutate the caller's state. They return a transition
containing new state and output. The caller must atomically persist that new state before sending or
acknowledging the output; only then may it call `disposeRatchetState` on the old state. This avoids
advancing counters or reusing key/nonce material across a crash.

JavaScript cannot guarantee constant-time execution, prevent garbage-collector copies, or guarantee
zeroization. `wipe` and `disposeRatchetState` are best-effort exposure reduction, not a security
boundary. Private keys and ratchet state must stay in the encrypted client vault and must never be
logged, included in errors, uploaded to the node, or restored from a recovery archive.
