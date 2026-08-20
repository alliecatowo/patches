# ADR 0025 — Franking: context-bound commitment, envelope AD binding, unskippable recipient verification

- **Status:** Accepted
- **Date:** 2026-08-20
- **Amends:** ADR 0020 §9 (the construction it left undecided), and ADR 0020 §8 (where the opening travels)
- **Closes:** B-045, B-046, B-047 (the three blockers ADR 0024 raised); the commitment half of B-052
- **Does not close:** P13-014. The §12.7 independent **external** review gate stays shut. See "The gate stays closed".

## Context

ADR 0024 reviewed the shipped franking construction and rejected it. Its verdict, restated so this
ADR stands alone: `franking_commitment` is 32 bytes chosen entirely by the sender; the node only
length-checks them (`e2ee-fanout.ts:339`); they are absent from `fanout_digest`; they are not
associated data for any device envelope; and no code anywhere verifies a commitment on the
receiving side. A malicious sender therefore repudiates any message deterministically, at zero
cost, by encrypting the abusive plaintext honestly and setting the commitment to 32 random bytes.
The honest recipient's genuine report comes back `COMMITMENT_MISMATCH`, indistinguishable from a
fabricated one. `packages/domain/src/e2ee/franking.ts:39-43` already forbids exactly the
implementation `apps/server/src/modules/e2ee/report-evidence.ts:131` ships.

ADR 0024 recommended, in order: (1) a committing AEAD over the ciphertext — CTX, or GLR's
`CtE2`/`HFC` — so the commitment is a function of what was actually sent; failing that, (2) three
changes together — bind the commitment into every device envelope's AEAD associated data, add it
to `canonicalFanoutTranscript`, and make recipient verification mandatory — noting that "without
the third, the first two are decoration".

Two facts about the current tree shape the decision, and neither was visible from ADR 0024's
reading alone:

- **There is no client-side E2EE implementation at all.** `ratchetEncrypt`/`ratchetDecrypt` have no
  production caller in `apps/tui`, `apps/web`, or `apps/admin`; nothing outside
  `packages/crypto/scripts/generate-vectors.ts` calls them. So "recipient-side verification is
  absent" is not a bug in a receive pipeline — the receive pipeline does not exist yet. That makes
  this the last cheap moment to decide the shape, and it makes the deliverable a **library
  contract** rather than three client patches.
- **No node has ever accepted an E2EE message.** `GetE2eeCapability` hardcodes
  `E2EE_CAPABILITY_STATE_DISABLED`, and `E2EE_APPROVED_FRANKING_PROFILES` is empty. There is no
  franked message anywhere to migrate. This is the only reason a construction change under an
  unchanged profile identifier is safe, and it is a one-time reason.

## Decision

Take **ADR 0024's option 2, all three parts**, hardened in four ways it did not require, and
**reject option 1** for this architecture. The franking profile identifier stays
`patches-franking-v1`; the bytes behind it are redefined here.

### 1. The commitment binds its metadata context, not just the plaintext

```text
K_f  ← 32 random bytes                       (the opening; sender-generated, per logical message)
T_c  = string("patches-e2ee-v1/franking/commitment")
    || string(frankingProfile) || string(protocol) || u8(version)
    || string(conversationId)  || u64(membershipEpoch)
    || string(senderActorId)   || string(senderDeviceId)
    || bytes(plaintext)
C    = HMAC-SHA256(K_f, T_c)
```

Every field is length- or width-prefixed, so `T_c` is injective. `frankingProfile` replaces
`E2EE_ALGORITHM`, which named the _ratchet suite_ and is the wrong agility knob (ADR 0024's B-052,
commitment half): a future `patches-franking-v2` with a similar layout is now not cross-acceptable
with v1. Binding conversation, epoch, and sender means a commitment cannot be lifted from one
conversation, epoch, or sender into another — the node re-derives the same context from its own
stored row at report time, so a reporter cannot talk the node into checking a commitment against
metadata the node did not accept.

`K_f` is exactly 32 bytes on both sides, enforced by `requireKeyBytes`. That check is the entire
defense against the Grubbs/Lu/Ristenpart key-reduction attack on HMAC-as-commitment
(`HMAC(K, M) == HMAC(SHA256(K), M)` for `|K| > 64`), and this ADR makes it a named invariant with
a test rather than input validation with a comment.

### 2. The commitment is associated data for every device envelope

```text
AD_d = string("patches-e2ee-v1/franking/envelope-ad")
    || string(frankingProfile) || string(protocol) || u8(version)
    || string(conversationId)  || u64(membershipEpoch)
    || string(senderActorId)   || string(senderDeviceId)
    || string(recipientActorId)|| string(recipientDeviceId)
    || fixed(C, 32)
```

`ratchetEncrypt`/`ratchetDecrypt` already take external associated data; this defines what goes in
it. The recipient rebuilds `AD_d` from the **node-delivered** envelope metadata — including
`E2eeMailboxEnvelope.franking_commitment`, which the proto already carries (field 12), so no wire
change is needed. If the sender bound a different commitment, or the node swapped the one it
stored, or the node moved one device's envelope into another device's mailbox, AEAD decryption
fails and no plaintext is produced. Including the recipient's `(actorId, deviceId)` is a free
bonus: cross-mailbox envelope replay becomes an authentication failure rather than a puzzle.

### 3. The franking opening travels in the inner authenticated plaintext

```text
inner = u8(innerVersion) || fixed(K_f, 32) || bytes(plaintext)
```

This is ADR 0020 §8 as written ("Inner authenticated plaintext carries the true body length,
body/control event, group transcript data, and franking opening"), and it is what
`docs/research/e2ee-dms.md` explicitly left open. It also satisfies B-046's second half — "add
`opening_ciphertext` to `canonicalFanoutTranscript`" — better than the letter of that finding
would: an opening inside the body AEAD is covered by the AEAD tag itself, so there is nothing left
for a transcript to protect.

Consequently `E2eeDeviceEnvelope.opening_ciphertext` (proto field 5; `E2eeMailboxEnvelope` field 10) **must be empty under `patches-franking-v1`**, and the node rejects a non-empty one. The field
number is _not_ removed and _not_ reserved: it is retained, with its comment corrected, for a
future profile that seals the opening independently of the body. Spec §153 forbids reusing a
removed field number; the safest way to honour that is not to remove one.

### 4. Recipient verification is structural, not a policy anyone can forget

`packages/crypto` exposes exactly one function that returns E2EE plaintext, `openDeviceEnvelope`,
and it verifies the commitment before returning. There is no "decrypt" entry point that skips the
check and no boolean parameter that disables it. `ratchetDecrypt` stays available for what it is —
a ratchet primitive — but it does not know about envelopes, so it cannot be mistaken for the
message-open path.

This is the substantive difference between this ADR and "make recipient verification mandatory".
Mandatory-by-policy is what the current tree already claims in a doc comment and does not do. The
only durable form of "mandatory" is an API in which the checked path is the only path.

**UX for a mismatch (B-047's "specified UX"):** a failed commitment is a _hard_ failure. The
plaintext is discarded, never rendered, not even behind a warning. The conversation shows a
neutral, non-blaming placeholder — "A message from @sender could not be verified and was not
shown." — with no sender-attributed accusation and no fragment of the plaintext, and the envelope
is still acknowledged so the mailbox drains. Rendering it with a "cannot be reported" badge was
rejected: that hands the sender exactly the outcome the attack wants (abuse delivered,
unreportable) in exchange for a badge. Discarding it means a mis-franked message costs the sender
its delivery and buys nothing.

### What the node can and cannot conclude

Unchanged, and worth stating because it is easy to over-read this ADR. The node still cannot
verify a commitment at accept time — it has no plaintext, by design. It gains one new _structural_
check (the fanout digest now covers the commitment and profile, §5 below), which catches an
internally inconsistent send but not a lying one. The enforcement point is and must be the
recipient. What changes is the consequence of lying: before, the sender lied and the message was
delivered and unreportable; now, the sender lies and the message is not delivered at all.

### 5. `canonicalFanoutTranscript` covers the commitment and the profile

`canonicalFanoutTranscript` takes the logical message rather than a bare envelope array, and
prefixes `frankingProfile` and `frankingCommitment` before the sorted per-envelope tuples. Each
envelope contributes `openingCiphertext` too, which is empty under v1 but keeps the encoder honest
if a later profile fills it. The node recomputes this in `assertFanoutDigest`, so a send whose
declared `fanout_digest` does not cover the commitment it declares is rejected outright.

### 6. The node verifies the commitment against its own stored context

`FrankingVerifier.verifyCommitment` gains the commitment context, and the server builds it from
the `E2eeLogicalMessage` row — never from the request. The report path already sourced
`commitment`, `franking_tag`, and the transcript from the node's own rows; the context now follows
the same rule.

## Why not a committing AEAD over the ciphertext (ADR 0024's first preference)

Verified against the source rather than recalled: Chan and Rogaway, _On Committing
Authenticated-Encryption_ (ePrint [2022/1260](https://eprint.iacr.org/2022/1260), Fig. 2, retrieved
2026-08-20) define CTX over a tag-based nAE scheme `Π` and a collision-resistant `H` as

```text
CTX.E(K, N, A, M):  C ← Π.E1(K,N,A,M);  T ← Π.E2(K,N,A,M);  T* ← H(K, N, A, T);  return C ‖ T*
CTX.D(K, N, A, C):  C‖T ← C; M ← Π.D1(K,N,A,C); T' ← Π.E2(K,N,A,M);
                    if T ≠ H(K,N,A,T') then return ⊥; return M
```

The commitment is `H(K, N, A, T)` — **a function of the AEAD key `K`**. In this architecture `K` is
the per-device Double Ratchet message key. Dropping CTX in as-is therefore produces:

- **a commitment per device, not per logical message.** `E2eeLogicalMessage.franking_commitment`,
  `e2ee_logical_messages.franking_commitment`, `FrankingReportTranscript.commitment`, and ADR 0020
  §9's "one hidden opening and commitment for the logical plaintext" are all singular. Making them
  plural is a proto + migration + transcript redesign, and it _loses_ the property that ties a
  logical message's devices together — the exact property ADR 0024's equivocation finding is about.
- **an opening that is ratchet key material.** The reporter would disclose a Double Ratchet message
  key to the node. It is a chain leaf, so forward secrecy survives, but "the moderation evidence
  path carries live ratchet keys" is a materially worse blast radius than "it carries a
  single-purpose random 32-byte value", and §98/§101/§183.1 are stricter about the former.

Making CTX fit properly requires the two-layer restructure: one content key `K_c` per logical
message, one shared body ciphertext for every device, per-device ratchet envelopes carrying only
`K_c`, and `C = H(K_c, body)`. That is genuinely stronger on one axis — equivocation becomes
impossible _structurally_ rather than by collision resistance — and it costs: a redesigned
`E2eeDeviceEnvelope`, a new shared-body table, a redefinition of `ciphertext_digest` (which becomes
nearly meaningless per device), a rewrite of the fanout accept path, and abandonment of ADR 0020
§6/§8's "each recipient payload is a normal header-encrypted Double Ratchet message of the padded
plaintext".

It is not worth it, because **the equivocation gap closes anyway under this ADR**. Sending `P₁` to
device A and `P₂` to device B under one commitment `C` requires openings `K₁, K₂` with
`HMAC(K₁, T_c(P₁)) = HMAC(K₂, T_c(P₂)) = C`. With both keys fixed at 32 bytes, `(K, M) ↦
(K⊕ipad)‖M` is injective, so that is a SHA-256 collision. The sender can at most make the message
_undecryptable or unopenable_ for a subset of devices — a delivery-denial capability it already
has, since it composes every ciphertext — and those devices show the §4 placeholder rather than a
second, different, verified message. Two devices displaying different verified content is
infeasible. That is the property ADR 0024 asked for; CTX would buy the same property with a
structural rather than computational argument, at the cost of a protocol rewrite.

This is a deliberate departure from ADR 0024's stated first preference, made with its analysis in
hand. ADR 0024 is a review, not a spec, and it did not have the CTX key-dependence problem in view
when it ranked the options.

## What this does not solve

Stated plainly, because a franking ADR that reads as "solved" is how the next reviewer gets
misled.

- **The node cannot detect a mis-franked message at accept time.** It has no plaintext and never
  will. A hostile sender can still burn a message slot to make a recipient render "could not be
  verified", which is indistinguishable from a buggy client or a tampering node. That is a nuisance
  and a small metadata signal, not a repudiation.
- **A recipient running a modified client can skip the check.** It gains only the ability to look
  at content it cannot report. No other participant is harmed. The API shape defends against
  _forgetting_, which is the realistic failure, not against a determined local user.
- **Binding rests on SHA-256 collision resistance and on the 32-byte opening length.** Widening
  `requireKeyBytes` to accept a longer opening silently reintroduces the GLR attack. There is now a
  test that fails if the length rule is relaxed, but a contributor who deletes the test and the
  check together still wins.
- **`ciphertext_digest` is still sender-asserted** and never recomputed from `ciphertext` anywhere
  (B-053, open). The fanout digest and the node tag therefore commit to a digest the sender chose,
  not to the bytes the node stored.
- **`attachReportEvidence` still performs no conversation-membership check** (B-054, open).
- **`assertFrankingProfileApproved` has no production caller.** The ship gate is a constant nobody
  consults; what actually keeps E2EE off is `GetE2eeCapability` returning `DISABLED` and no node
  holding a franking key. `e2ee.controller.ts`'s doc comment claims the send path throws through
  that function, and it does not. Corrected in this change and filed as B-058 — wiring it into the
  accept path would make every case in `e2ee.integration.test.ts` throw, which is a separate
  decision about how that suite gets a test node, not a drive-by.
- **Nothing here is a proof.** The binding and hiding arguments above are arguments by inspection
  under standard assumptions, by one internal author. They do not discharge ADR 0020 §12.7.

## Does deniability survive?

Yes, and nothing in this ADR touches the part that provides it. ADR 0024 judged the node's
symmetric report tag sound and `createNodeReportTag` correct; both are unchanged. No sender
signature is added anywhere. The commitment `C` is an HMAC under a key the node never receives, so
it is pseudorandom to the node and reveals nothing about the plaintext — binding it into associated
data does not publish it any more widely than storing it already did, and associated data is not
transmitted. The node's tag remains symmetric, node-keyed, and node-forgeable, which is precisely
what keeps franking evidence "this node accepted this" rather than transferable proof.

## The gate stays closed

`E2EE_APPROVED_FRANKING_PROFILES` remains `Object.freeze([])` and `assertFrankingProfileApproved`
still throws for every profile. **This ADR does not authorize opening it, and landing a construction
that survives internal review is not evidence that opening it is a formality.** ADR 0020 §12.7
requires an independent _external_ cryptographic review; ADR 0024 was one internal reviewer and this
ADR is one internal author. P13-016 and P13-014 both stay blocked until an external review has run
against the construction described here — which is a different construction from the one ADR 0024
reviewed, so any prior review effort does not carry over.

## Consequences

**Positive**

- A sender who supplies a commitment unrelated to what it encrypted no longer gets its message
  delivered. Repudiation costs delivery.
- The receive pipeline that does not exist yet can only be built the correct way, because the only
  plaintext-returning API verifies.
- The three clients inherit franking verification from `@patches/crypto` without each reimplementing
  it — the failure mode where one of three clients forgets is designed out.
- No proto field is added, removed, or renumbered; `E2eeMailboxEnvelope` already delivers everything
  a recipient needs. No database migration.

**Negative**

- `commitFranking`, `verifyFrankingCommitment`, `canonicalFanoutTranscript`, and
  `FrankingVerifier.verifyCommitment` all change signature. Committed test vectors change with them.
- The commitment now requires message metadata at both ends, so a caller that has the plaintext but
  not the conversation context can no longer compute it. That is intentional — that caller was the
  bug — but it makes the API less convenient to misuse and less convenient to use.
- `opening_ciphertext` becomes dead weight on the wire under v1: a field that must be empty. The
  alternative was removing it and reserving the number, which spec §153 tolerates but which buys
  nothing while a future profile may want it back.
- Clients must render a "could not be verified" placeholder state that has no other cause, and must
  resist the product pressure to show the message anyway.

## Alternatives considered

- **CTX / GLR `CtE2` / `HFC` over the device ciphertext (ADR 0024's first preference).** Rejected
  above: the commitment is key-dependent, so it is per-device, and the opening becomes ratchet key
  material. The two-layer variant that fixes both is a protocol rewrite that buys a property this
  ADR already obtains from collision resistance.
- **Keep the sender-chosen commitment and only add the two bindings (B-046 alone).** This is what
  ADR 0024 called decoration, and it is right: without §4 nothing ever compares the commitment to a
  plaintext.
- **Have the node verify the commitment.** Impossible without plaintext, which is the entire point
  of E2EE. Any scheme where the node can check is a scheme where the node can read.
- **Bump the profile to `patches-franking-v2`.** Rejected only because `patches-franking-v1` has
  never been approved, never been enabled, and never franked a message on any node, so there is
  nothing to distinguish it from. From this ADR onward the rule is strict: **any change to the
  bytes bumps the profile string**, and the profile is now bound into the commitment so that rule
  is enforced by the cryptography rather than by review.
- **Render a mis-franked message with an "unreportable" badge.** Rejected: it delivers the abuse and
  makes unreportability a feature the attacker selects.
- **Put the opening in `opening_ciphertext`, sealed under a second derived key.** Rejected: it needs
  a second key derivation off the ratchet message key, exposing that key to the envelope layer, in
  exchange for a property the body AEAD already provides for free.
