# 0020. End-to-end encrypted direct messages

**Status:** Accepted
**Date:** 2026-08-18

## Context

`INITIAL_VISION.md` §195.1 requires an explicit owner decision and an ADR before end-to-end
encrypted direct-message code is authorized. The owner gave that authorization on **2026-08-18**
and asked for the unfinished `packages/crypto/**` spike to be recovered and audited before any
production wiring.

The authorization changes the long-term architecture; it does not make the current product or the
spike E2EE. Section 183 and [ADR 0017](./0017-server-visible-dms.md) remain the truth for existing
v0 conversations: the node can read them and every client must say so. Section 194's prohibition on
calling those conversations encrypted, secure, end-to-end, or private remains absolute.

The audit in [the E2EE DM research note](../research/e2ee-dms.md) found useful primitives but also
two critical gaps: the separate Ed25519 and X25519 identities are not cryptographically bound, and
the fixed symmetric chains are not Signal's Double Ratchet. There is also no safe persistent state,
multi-device protocol, server envelope, recovery, group protocol, or proven franking construction.
The spike cannot be promoted by wiring it to the server.

This decision preserves the spec's intent: DMs stay local to one node, block/request/rate-limit
rules still apply, group size stays at eight, bodies never enter logs, and abuse reports remain
actionable. The smallest acceptable substitute for server visibility is client-side encryption plus
verifiable, reporter-disclosed evidence—not removal of moderation.

## Decision

Patches will add a second, immutable conversation mode, `E2EE_V1`, using certified per-device
identities, X3DH-class asynchronous setup, the full Double Ratchet with encrypted headers,
Sesame-style multi-device sessions, pairwise device fanout, and independently reviewed message
franking. It will coexist with `LEGACY_SERVER_VISIBLE` until every ship gate below is complete.

The unfinished crypto package remains a research artifact. Noble 2.3.0 is accepted only as a
candidate primitives backend behind a narrow adapter, not as approval of the current protocol.

### 1. Security boundary and conversation modes

1. `LEGACY_SERVER_VISIBLE` and `E2EE_V1` are distinct, immutable conversation modes. A row or
   envelope can never be interpreted as both.
2. An E2EE conversation never falls back to plaintext or a server-held decryption key. If a member
   or active device cannot participate, sending fails with content-free user copy.
3. The node continues to authorize membership, enforce message-request/mutual-follow/block rules,
   rate-limit sends, retain ciphertext, and route device payloads. It never receives E2EE body
   plaintext or a decryption key.
4. The only E2EE plaintext intentionally disclosed to the node is evidence the reporter explicitly
   selects and submits through the abuse-report flow. It receives report-level access controls and
   retention and is never logged, traced, metered, or placed in error payloads.
5. No job, outbox row, notification, backup, analytics event, search index, exception, or moderator
   view receives an E2EE body except that explicit report evidence. Notifications contain only a
   generic new-message signal and conversation identifier.

### 2. Account and device identity

Each actor has one long-lived **messaging identity root**, an Ed25519 signing key separate from
login credentials. Its public key is the stable input to that actor's safety number. Its private key
normally remains on one identity-authority device and in an optional encrypted recovery archive;
ordinary linked devices do not receive it.

Each installation has a random, stable device id and two independent keypairs:

- an Ed25519 device-signing key for prekey bundles and device/control records; and
- an X25519 device-identity key for X3DH and authenticated device-to-device sessions.

The messaging root signs a canonical device certificate binding actor id, device id, both public
keys, creation time, protocol capabilities, and certificate version. The device Ed25519 key signs a
canonical prekey bundle that includes the certificate digest, X25519 device identity, signed prekey,
ids, protocol/KDF versions, creation time, and expiry. Protocol signature verification uses strict
RFC 8032 semantics, not noble's default ZIP-215 mode.

The account maintains a monotonically versioned, root-signed active-device roster. Clients cache
the highest version seen and include the roster version/digest in session and fanout decisions.
Messages gossip the authenticated digest so a server rollback or split view becomes detectable to
communicating devices. A malicious node can still deny service or show inconsistent first-contact
state; safety-number verification is the out-of-band authentication control.

Version 1 allows at most **eight active devices per actor**. This bounds a maximal eight-person
group message to 64 recipient-device payloads.

### 3. Safety numbers and identity changes

For a 1:1 conversation, clients show a versioned numeric fingerprint and QR encoding over the
ordered actor ids and messaging-root public keys. The encoding and display grouping require fixed
cross-client vectors; a custom "Signal-style" approximation is not acceptable. Group screens show
verification state per member and a group membership-epoch digest rather than pretending one group
number authenticates every device and membership change.

First contact is explicitly **unverified** until compared through another authenticated channel.
Without that comparison, X3DH and Sesame provide encryption but no cryptographic guarantee that the
node did not substitute an identity.

- Adding or revoking a correctly root-certified device produces a visible security event but does
  not change the account safety number.
- A messaging-root change is a hard identity change. New sends pause until the user explicitly
  acknowledges it; verified contacts must re-verify. A client never silently trusts the new root.
- If an old root signs the transition, the UI may distinguish a planned rotation from an
  unverified reset, but both remain visible.
- Every device-list and identity warning must be reachable in the terminal and headless client; it
  cannot depend on a browser or QR scanner because the TUI fallback remains mandatory.

### 4. Secret storage and ratchet persistence

Raw identity, prekey, ratchet, skipped-message, franking-opening, backup, and plaintext-history
material lives only in an encrypted client vault.

- On the TUI/Node client, the OS keychain stores a random wrapping key; the larger vault is an
  authenticated encrypted file/database with owner-only permissions. On systems without a
  keychain, a separately entered local passphrase protects the wrapping key with a reviewed
  memory-hard KDF. Secrets never appear in config files, environment variables, command arguments,
  shell history, or logs.
- Each future client needs its own reviewed vault adapter and runtime entropy gate. A browser or
  React Native integration is not approved merely because the primitives compile there.
- Send state advances and a local encrypted outbox entry are committed atomically **before** bytes
  reach the network. Receive state, skipped-key deletion, plaintext history, and acknowledgement are
  committed atomically only after AEAD/franking validation. A forged ciphertext cannot permanently
  advance the live state.
- One process owns a device vault at a time. Crash recovery and rollback tests must prove that a
  message key and nonce cannot be reused.
- JavaScript wiping remains best-effort hygiene, never a claimed control.

### 5. Prekeys and session establishment

Production uses the X3DH DH structure as the classical v1 setup, modified only to support the
certificate chain for separate Ed25519/X25519 identities. It uses X25519, HKDF-SHA-256 with
byte-encoded domain labels, and authenticated canonical transcripts. The initial ciphertext is
processed as one operation: verify certificate and bundle, derive, authenticate the first Double
Ratchet message, persist the session, then consume the one-time private key.

- Each active device maintains a server inventory target of **100** one-time X25519 prekeys and
  replenishes when the count reaches **20**. The node atomically returns and removes at most one
  per device bundle fetch and rate-limits draining.
- Each device rotates its signed prekey every **seven days**. Previous signed-prekey private keys
  are retained only for the 30-day device-mailbox `MAXLATENCY`, then deleted after pending initial
  envelopes are processed. A device offline beyond that window rejoins with fresh sessions and
  restores history from a peer or recovery archive, not old prekey state.
- The no-one-time-prekey X3DH fallback is allowed for availability exactly as the specification
  describes, but the bundle and local session record must preserve that fact. The node cannot make
  a client claim one-time-prekey forward secrecy it did not receive. Fetch rate limits and
  inventory alerts limit forced depletion.
- Replays, expired bundles, unknown certificates, roster rollback, low-order X25519 inputs,
  malformed ids, and non-canonical encodings fail before state is committed.

Classical v1 makes no post-quantum claim. Scheme and KDF identifiers are versioned so a separately
reviewed PQXDH/triple-ratchet profile can replace setup later without interpreting old bytes under
new rules.

### 6. Full Double Ratchet is mandatory

Every device pair has a Double Ratchet session conforming to the Signal revision 4 state machine:
DH sending/receiving keys, retained root key, sending/receiving chain keys, current and previous
chain counters, and skipped keys indexed by `(ratchet public key, message number)`. A DH ratchet
step mixes fresh X25519 output into the root chain and replaces chain keys. This is the required
post-compromise healing mechanism; two fixed symmetric chains can never ship as E2EE.

The revision 4 header-encryption profile is required so the node does not learn ratchet public keys,
message counters, or chain boundaries after setup. Skip work per chain and retained keys per session
and device are bounded; old skipped keys expire. Exact bounds are protocol constants covered by
vectors and DoS tests, not remote node configuration.

Payload encryption uses XChaCha20-Poly1305 with an independently derived 32-byte AEAD key and
24-byte nonce from each single-use message key. Canonical associated data binds protocol version,
conversation and membership epoch, logical/client/server message ids where known, sender and
recipient actor/device certificates, roster digest, Double Ratchet header, payload index, and
franking commitment. Plaintext is not compressed and is padded into fixed size buckets before
encryption so the node learns a coarse bucket rather than the exact body length.

Post-compromise healing is accurately described: it occurs only after an uncompromised party
contributes a fresh DH ratchet key and the corresponding messages are delivered. It is not instant
recovery from a device that remains controlled.

### 7. Multi-device and groups

Session selection and retry behavior follow Sesame's active/inactive per-device model. A sending
device encrypts one logical message separately to:

- every active device of every recipient; and
- all of the sender's other active devices, so sent history is available there.

The node atomically accepts one bounded fanout and never silently drops a certified active device.
Missing or exhausted setup material fails/retries the logical send. Revoked and stale devices are
excluded according to the signed roster. Delivery acknowledgements may clean mailboxes but are not
exposed as read receipts.

Groups remain limited to eight members and use the same pairwise device fanout. Version 1 does not
introduce a shared sender key or MLS. Root/device-certified group control events establish a
monotonic membership epoch and transcript digest; every payload binds that epoch. A new member gets
future messages only unless an existing member explicitly transfers selected history E2EE. A
leaving or removed member receives no future payloads. Pairwise fanout avoids a separate group-key
rotation protocol and is acceptable under the 8 × 8 bound.

### 8. Encrypted logical envelope and metadata

The server schema stores a versioned logical envelope with only the fields it needs:

```text
protocol/scheme version
conversation id and membership epoch
client idempotency id and node-assigned message id
sender actor id and device id
recipient device ids with opaque prekey/ratchet payload bytes
ciphertext size bucket
franking commitment, franking-key id, and node tag
server accepted-at and delivery/expiry state
```

Each recipient payload contains either an initial X3DH/Double-Ratchet message or a normal
header-encrypted Double Ratchet message. Inner authenticated plaintext carries the true body length,
body/control event, group transcript data, and franking opening.

E2EE cannot hide from the node the local conversation graph, sender and recipient device ids,
server acceptance time, coarse ciphertext size, prekey inventory, mailbox fetches, IP/request
metadata, or content a reporter discloses. It does hide message bodies, inner control text, ratchet
headers after setup, safety numbers, client history, and keys. Product copy must state both sides
without calling metadata-private messaging "private" in an unqualified way.

### 9. Abuse reports and message franking

Every logical E2EE message is franked. The sender creates one hidden opening and commitment for the
logical plaintext; that opening is encrypted to every recipient device. Each device payload
authenticates the common commitment. After accepting the complete fanout, the node returns a
versioned symmetric tag over a canonical transcript including node/franking-key era, protocol,
conversation/epoch, logical message ids, sender actor/device, recipient/fanout digest, accepted-at,
commitment, and every ciphertext digest.

A report explicitly shows and submits selected plaintext, opening, complete stored envelope/tag,
and up to ten selected surrounding messages. The node verifies the commitment, node tag, envelope
digests, sender, and conversation authorization before marking evidence verified. Failed verification
does not discard a report; it marks the content unverifiable. Moderator UI must say that even
verified context is reporter-selected and may omit provocation.

No sender signs message content. The node's symmetric tag lets the node forge a report transcript,
so it is evidence for that node's moderation, not transferable proof to a third party. The exact
committing-AE/commitment construction is selected only after independent cryptographic review for
sender binding, receiver binding, multi-opening security, domain separation, and key rotation. The
spike's keyed-BLAKE2 construction is not approved by this ADR.

### 10. Backup, recovery, and lost devices

Backup is optional and end-to-end encrypted under a generated high-entropy recovery key the node
never receives. The user can export the ciphertext or store it as an opaque node blob. The archive
may contain the messaging-root private key, signed roster, device-independent settings, and
encrypted message history/franking material. It never restores live Double Ratchet counters,
skipped keys, one-time prekeys, or old device identity keys.

Recovery creates a fresh device certificate and fresh sessions. History comes from the encrypted
archive or an authenticated E2EE transfer from an existing device. Account-password reset alone
cannot decrypt E2EE history. If every device and the recovery key are lost, the history is
irrecoverable; clients must say this before E2EE is enabled and when backup is declined.

A lost device is revoked from a trusted identity-authority device or recovery flow. The signed
roster advances, the node deletes its unused public prekeys and stops future delivery, and peers
destroy sessions to it. Revocation cannot erase keys or plaintext already obtained by the lost
device. If no root signer survives, authenticated account recovery performs an emergency messaging-
root rotation; all contacts receive the hard identity-change warning and verified contacts must
re-verify. Remote wipe is never promised.

### 11. Migration and staged delivery

There is no in-place cryptographic upgrade of a server-visible conversation. The server has already
seen that history; encrypting a copy cannot change that fact.

1. **Research recovery (this change).** Preserve the spike, research note, and ADR. No product
   capability or E2EE claim.
2. **Protocol core.** Implement certified identities, canonical codecs, X3DH initialization, full
   Double Ratchet with header encryption, franking candidate, transactional state abstraction, and
   official/cross-implementation vectors. No server or client product wiring.
3. **Node protocol behind a disabled capability.** Add device roster/prekey/envelope/report APIs,
   opaque storage, atomic fanout, rate limits, and no-plaintext tests. It stays disabled outside
   isolated test nodes.
4. **Single-device 1:1 integration.** Add the client vault, safety-number/identity-change UX,
   message requests, encrypted reports, and failure recovery on isolated test nodes. Legacy remains
   the only production mode.
5. **Multi-device, recovery, and groups.** Add linking, Sesame convergence, own-device fanout,
   backup/recovery/revocation, and pairwise groups through eight members. Run adversarial and crash
   testing.
6. **Independent review and canary.** Complete the protocol/implementation audit and remediate all
   findings. Only then may an operator enable an explicitly experimental E2EE capability for a
   bounded canary with no automatic downgrade.
7. **Encrypted default for new conversations.** After canary exit criteria, new conversations
   whose members are capable use `E2EE_V1`. Existing conversations remain visibly legacy and can
   start a separate encrypted successor. Legacy history is not copied or relabelled; later
   deprecation of legacy sending requires its own product migration decision.

Clients that do not understand `E2EE_V1` cannot join or render it. The server publishes capability
and minimum-client information, but a capability never gates payment or social function.

### 12. Hard ship gates

No production conversation may use, advertise, or be labelled `E2EE_V1` until all gates pass:

1. Full Double Ratchet with encrypted headers and bounded skipped-key handling passes official,
   generated transcript, out-of-order, replay, malformed-input, and cross-client vectors.
2. Account-root certificates, signed monotonic rosters, complete prekey transcript binding, safety
   numbers, identity-change blocking, and device-event UX pass adversarial server tests.
3. Atomic prekey pop/consume/replenishment/rotation and drain rate limits pass concurrency tests.
4. Encrypted vaults and transactional send/receive state pass crash, rollback, duplicate-process,
   corrupt-state, and key/nonce non-reuse tests on every shipping runtime.
5. Sesame-style fanout, simultaneous initiation, retry, stale/revoked devices, sender-device copies,
   and the 8-member/8-device bounds pass interoperability and DoS tests.
6. Envelope padding, authorization, block/request behavior, generic notifications, retention, and
   explicit automated assertions that no E2EE plaintext/key reaches server storage, logs, metrics,
   traces, errors, outbox payloads, or backups all pass.
7. Franking passes independent cryptographic review and end-to-end report tests, including forged,
   replayed, selectively disclosed, malformed, old-key-era, and unverifiable evidence.
8. Backup, peer transfer, fresh-device recovery, root rotation, irrecoverable-loss copy, revocation,
   and the impossibility of remote wipe are implemented and tested.
9. A threat model and independent security audit cover the exact protocol composition, noble
   release/provenance, codecs, persistence, server APIs, clients, and dependency supply chain; all
   critical/high findings are fixed and reviewed. Primitive-library audits alone do not satisfy it.
10. Legacy/E2EE mode separation, labels, export/deletion semantics, capability negotiation, and the
    no-downgrade migration path pass product and security review.
11. Federation tests prove that no DM key, prekey, envelope, report, or delivery path crosses the
    `FederationGateway`, even when public federation is enabled for other content.

### 13. Federation remains prohibited

This ADR authorizes **local-node E2EE only**. It does not authorize federated key discovery,
cross-node envelopes, remote moderation evidence, ActivityPub addressing, or any DM traffic through
the federation seam. Section 194 and §195.6 remain unsatisfied for federated DMs. A future proposal
needs separate owner sign-off, current research, a threat model spanning independently operated
nodes, and a new ADR.

## Consequences

**Positive.** The node cannot read ordinary E2EE bodies; every message gets forward secrecy and,
after fresh DH exchange, post-compromise healing; device additions are root-certified; server key
substitution is visible through safety numbers and roster gossip; reports remain verifiable without
public message signatures; and small groups reuse one reviewed pairwise protocol.

**Costs and limits.** The node still learns substantial routing/timing metadata. Reports disclose
selected plaintext and are weaker context than ADR 0017's server snapshot. Lost keys can mean lost
history. Every active device multiplies fanout and local state. JavaScript cannot guarantee
constant-time execution or complete zeroization. Header encryption, durable state, identity UX,
recovery, and audit make this a multi-stage security project rather than a feature flag.

ADR 0017 remains accepted for legacy conversations. This ADR supersedes only its statement that E2E
is unauthorized: the named owner authorization now exists, subject to every gate above.

## Alternatives considered

- **Ship or incrementally wire the current spike.** Rejected: unauthenticated split identity,
  missing DH ratchet, nonconforming state/header, no persistence/multi-device protocol, unreviewed
  franking, and a currently non-building package.
- **Keep only server-visible DMs.** Rejected by the owner's explicit authorization and the desired
  confidentiality boundary, while retained as the compatibility mode.
- **Server-held encryption or escrow/recovery keys.** Rejected: the node could decrypt and the mode
  would not be end-to-end encrypted.
- **Publicly sign every message for reports.** Rejected: it creates transferable authorship proof
  and destroys the deniability that franking preserves.
- **Shared group sender keys or MLS in v1.** Rejected: pairwise fanout is bounded at eight members
  and avoids another key-distribution/removal protocol.
- **Restore live ratchet state from backup.** Rejected: rollback can reuse keys/nonces and Sesame
  sessions can be orphaned. Recovery always creates fresh device/session state.
- **Use Signal's `libsignal` directly.** Rejected for this architecture: the published package is
  AGPL-3.0-only while Patches is MIT, is native/large rather than a portable browser/RN TypeScript
  backend, and does not remove the need to design Patches devices, storage, envelopes, reports, and
  migration. It remains a useful interoperability oracle where licensing permits test use.
- **Re-encrypt legacy history in place.** Rejected as a false security claim; prior server access
  cannot be undone.

No fable escalation is required. Signal's primary specifications provide clear precedent, and the
unresolved cryptographic construction is made an external-review ship gate rather than guessed here.
