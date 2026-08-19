# End-to-end encrypted direct messages

**Status: protocol core implemented; node/client integration and independent review pending; production disabled.**

[ADR 0020](../decisions/0020-e2ee-direct-messages.md) is binding. This document records the
implemented boundary and rollout status; it is not evidence that E2EE is enabled.

## Conversation modes

| Mode                    | Node body access                                     | Mutation / fallback |
| ----------------------- | ---------------------------------------------------- | ------------------- |
| `LEGACY_SERVER_VISIBLE` | The node stores and can read the existing plaintext. | Immutable.          |
| `E2EE_V1`               | The node routes opaque ciphertext and metadata only. | Immutable.          |

Legacy history is never relabelled, copied into an encrypted conversation as if it had always been
protected, or upgraded in place. An E2EE send fails when the capability or any active participant
device is unavailable; it never falls back to plaintext. Clients that cannot support the protocol
cannot join or render that conversation.

The domain contract in `packages/domain/src/e2ee.ts` pins the immutable modes, rollout states,
8-member/8-device fanout bound, 100 one-time-prekey target, seven-day signed-prekey rotation,
ten-message report-context limit, and no-downgrade negotiation.

## Cryptographic boundary

`@patches/crypto` implements certified account-root/device identities, signed monotonic roster
digests, transcript-bound X3DH-class setup, and Signal's revision-4 Double Ratchet encrypted-header
profile. Its exact sources and state-commit contract are documented in
`packages/crypto/README.md`.

The implementation uses Noble 2.3.0 primitives. This is not an audit of Patches' composition.
JavaScript cannot guarantee constant-time execution or complete zeroization; wiping is best-effort.
Cross-client vectors and independent security review/remediation remain hard ship gates.

## Node boundary

The local node may authorize membership, enforce blocks/requests/rate limits, atomically consume
public one-time prekeys, retain opaque envelopes, and return a versioned franking tag. It must never
receive ordinary message plaintext, message keys, ratchet state, device private keys, or recovery
keys. The only intentional plaintext disclosure is evidence a reporter explicitly selects.

The node still learns local conversation membership, sender/recipient device ids, acceptance time,
coarse ciphertext size, prekey inventory, mailbox fetches, and network/request metadata. Product copy
must state this metadata exposure without calling the mode metadata-private.

No key, prekey, envelope, report, or DM delivery may cross `FederationGateway` or ActivityPub. E2EE
is local-node only.

## Rollout state

The production capability remains `DISABLED`. `ISOLATED_TEST_ONLY` is valid only on an explicitly
isolated test node. `EXPERIMENTAL_CANARY` and `ENABLED` are post-review states and must not be selected
until ADR 0020's automated gates and P13-014 independent review/remediation are complete.
