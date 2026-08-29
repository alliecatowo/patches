# 0037. E2EE device linking and client-reachable root rotation

**Status:** Accepted
**Date:** 2026-08-27
**Amends:** [0020](./0020-e2ee-direct-messages.md) §2, §3, §10, §11 stage 5 (how a second device
joins an account, and how an account recovers when no authority device survives)
**Relates to:** [0033](./0033-one-e2ee-identity-transcript-family.md),
[0034](./0034-shared-client-e2ee-runtime.md), [0036](./0036-shipping-e2ee-conditions-capability-states-and-copy.md);
issues #265, #266, #272

## Context

ADR 0020 §2 says the messaging-root private key "normally remains on one identity-authority
device and in an optional encrypted recovery archive; ordinary linked devices do not receive it."
Every device's certificate and every roster is root-signed. That is implemented and enforced
(`appendRoster`, `assertRosterSucceeds`). What was never implemented is the ceremony by which a
device that does **not** hold the root gets a root-signed certificate: both clients refuse with
_"Linking an existing identity is not available yet — enroll from the device that set it up."_

The consequence showed up in practice on 2026-08-27: a cleared browser vault left an account with
a published root that no device held, and the workaround that reached the tree was a
`DeleteIdentityRoot` RPC. It was reverted (issue #266 records why: it stranded the roster chain,
500'd on rotated accounts, and erased the generation history that makes an identity substitution
_visible_ — §3's whole point). The correct primitives already exist server-side: `EnrollDevice`
accepts any root-signed certificate + roster, and `PublishIdentityRoot` already implements
generation N+1 rotation with the mandatory accompanying roster (`identity-root.service.ts`). No
client can reach either without the root key.

Two distinct situations, two distinct answers:

1. **An authority device exists** (the phone/laptop that bootstrapped, or one that later imported
   the recovery archive). The new device must be _linked_: certified by the existing root, added to
   the roster, with the safety number unchanged (§3).
2. **No authority device exists and no archive** (or the user declines to use it). The only honest
   path is a _root rotation_: a new generation, a hard identity change every contact sees (§3, §10).

## Decision

### 1. Linking is a node-relayed, SAS-authenticated, authority-signed enrollment

The new device never receives the root key, and the authority device never receives the new
device's private keys. All that crosses the node is public material, and the node is treated as
an active adversary for substitution: a short authentication string compared out of band is what
binds the two devices, exactly as safety numbers do for peers.

Flow:

1. **New device** (`N`) generates its Ed25519 signing key, X25519 agreement key, device id, signed
   prekey, and initial one-time prekeys — the same `generateEnrollment` material as bootstrap,
   minus anything root-signed. It calls `BeginDeviceLink` with a **link offer**: the canonical
   transcript `E2eeDeviceLinkOffer` (below) plus its device signature over that transcript, and
   its device-signed prekey bundle and one-time prekeys (public halves only). The node stores the
   offer for at most **10 minutes**, keyed by a random `link_id`, at most **3 pending offers per
   actor**, and returns `link_id`. `N` displays the SAS and polls `GetDeviceRoster` for its own
   device id.
2. **Authority device** (`A`, holds `StoredEnrollment.rootPrivate`) calls `ListPendingDeviceLinks`
   (own actor only), decodes each offer with the canonical decoder, re-verifies the device
   signature over the offer bytes, computes the SAS from the **bytes it received**, and shows it.
   The user compares the two SAS displays. `A` refuses to sign unless the user explicitly
   confirms the match; a mismatch is surfaced as "the node showed this device different keys"
   and the offer is discarded — never retried silently.
3. On confirmation `A` signs the device certificate over `N`'s public keys, builds roster
   sequence `S+1` from the roster it has verified most recently (every existing entry carried
   verbatim, plus `N` active), and calls the **existing, unchanged** `EnrollDevice` with `N`'s
   device-signed prekey material passed through. The node verifies exactly what it verifies today
   (certificate ↔ root, roster ↔ chain, prekey bundle ↔ device signing key). It then deletes the
   offer.
4. `N`'s poll observes itself active in the served roster, verifies the chain (`chain.ts`), stores
   the certificate + roster into its `StoredEnrollment` (with `createdRoot = false` and no
   `rootPrivate`), and is enrolled. No message can be sent to or by `N` before this point.

`E2eeDeviceLinkOffer` is one more member of the ADR 0033 transcript family, encoded in
`@patches/crypto` with the same length-prefixed, domain-separated `ByteWriter` layout:
`domain "patches-e2ee-v1/device-link-offer" · version u8 · actor_id · device_id · signing_pub ·
agreement_pub · supported_protocol_versions · created_at_ms · expires_at_ms`. The device
signature is strict RFC 8032 over those bytes. The SAS is the first 60 bits of the domain's
digest over `"patches-e2ee-v1/device-link-sas" · offer_bytes · actor_id`, rendered as five groups
of four decimal digits — the same grouping the safety-number screen already uses, so the TUI
renders it as text with no QR dependency (§3's terminal requirement).

**What the node can and cannot do.** It can refuse to relay (denial of service, already
accepted in §2). It can substitute an offer — which changes the SAS on `A`'s side and is caught by
the comparison. It cannot mint a certificate (no root key) and cannot make `A` sign a key the user
did not confirm. Rate limits from #269 apply to `BeginDeviceLink` and `EnrollDevice`.

**Trust consequences.** A linked device is a "correctly root-certified device" in §3's words: a
visible security event to contacts, no safety-number change, no re-verification. `A` may later
export a recovery archive so `N` can become an authority too (#272); linking itself never copies
the root.

### 2. Root rotation is the recovery path, and the client can reach it

When enrollment finds a published root this vault does not hold, the client offers exactly three
outcomes, with fixed copy: **link** (§1 — "approve from a device that already has your messaging
identity"), **rotate** ("start a new messaging identity: everyone you message will be warned, and
history on lost devices is not recoverable"), or **cancel**. No fourth option deletes anything.

Rotate builds generation `G+1` where `G` is the served current generation, self-signed, with
`previous_root_signature` present **only** when the old root key is available locally (an imported
recovery archive) — that is §3's planned-rotation vs unverified-reset distinction, and the client
never fakes the countersignature. It calls the existing `PublishIdentityRoot` rotation path with a
fresh sequence-`S+1` roster under the new root that carries every prior entry **inactive** (the
old devices cannot be certified by the new root and must not be silently dropped, §14.4) plus this
device active, then continues into ordinary `EnrollDevice`. Peers' clients already pin roots and
require the countersignature to accept a rotation as planned (`transports.ts` C2); an unverified
reset therefore produces the hard identity-change block until acknowledged, as §3 requires.

### 3. Binding decisions

1. `EnrollDevice`, `PublishIdentityRoot`, and the roster rules are **unchanged**. Linking adds only
   the offer relay (`BeginDeviceLink`, `ListPendingDeviceLinks`, `CancelDeviceLink`); no RPC
   accepts an unsigned or node-decoded view of the offer.
2. The offer transcript and SAS derivation live in `@patches/crypto` next to the identity
   transcripts (ADR 0033 §1) with cross-client vectors; `apps/tui` and `apps/web` import them.
3. The authority computes the SAS from the bytes it received, never from the fields the node
   decoded for it (ADR 0020 §14.2).
4. Offers expire; expired or consumed offers are deleted, never reused; an actor's pending set is
   bounded. A pending offer is not a device: it never appears in a roster, fanout, or prekey
   inventory.
5. Deleting an identity root is not a supported operation. Recovery is rotation; a rotation is
   always visible.

## Consequences

**Positive.** Second devices become possible without moving the root key, and without any node
trust beyond availability. Lost-vault recovery has a correct path, and the identity-change
warning it triggers is a feature, not a bug. The server surface grows by three small RPCs and one
short-lived table; every security-relevant check reuses existing verified code.

**Costs.** A user must have both devices at hand and compare 20 digits; there is no "approve later"
because an offer expires in ten minutes. Rotation without the archive strands history on the old
devices — the copy must say so before the user confirms. Linking a device from the archive path
(#272) is still needed for the "phone died, laptop was never enrolled" case.

## Alternatives considered

- **`DeleteIdentityRoot`.** Reverted; see #266. It launders an identity substitution into a fresh
  bootstrap and stranded the roster chain.
- **Copying the root key to the new device over an encrypted channel.** Violates §2's authority
  model, would make every linked device an equal root holder, and needs a new pairwise channel
  that is itself a bigger protocol than the offer relay.
- **Authority signs offline, new device calls `EnrollDevice`.** Needs the certificate + roster to
  travel from `A` to `N`, i.e. a second relay in the other direction. §1 needs only one.
- **QR-only pairing.** Fails §3's terminal/headless requirement; the SAS-as-digits form is the
  fallback and therefore the primary.
