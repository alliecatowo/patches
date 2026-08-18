# 0014. Capabilities, not tiers, in the protocol

**Status:** Accepted
**Date:** 2026-08-17

## Context

Some Patches features cost the node operator real money: page asset storage, custom domains,
animated nameplates, custom fonts. The reference node (`patches.social`) is expected to fund
that through a supporter tier. Meanwhile a self-hoster running a node for eight friends has
no reason to restrict anything.

The default industry move is to put a `tier` or `plan` field on the account and branch on it
in the client. That is exactly the wrong shape for this product for three reasons:

1. **It leaks money into the protocol.** Once clients branch on `tier`, tier becomes a
   visible social attribute — a caste marker rendered next to a name. That is the metrics
   theater the product exists to avoid (§4.2, §4.5).
2. **It doesn't survive federation or self-hosting.** "Plus" means nothing on a node with no
   billing, and nothing consistent across nodes with different economics.
3. **It puts the pricing model in the wire format.** Every pricing change becomes a protocol
   change, and the pricing model of one node becomes the vocabulary of all of them.

## Decision

The protocol expresses **capabilities**, granted per node by policy. See
`INITIAL_VISION.md` §174.

```text
capabilities {
  animatedNameplate
  customDomain
  maxSiteStorageBytes
  customFonts
  ...
}
```

- There is **no** `tier`, `plan`, `subscription`, `premium`, or `is_supporter` field in the
  protocol, and no client branches on one. Clients branch on capabilities only.
- Capabilities are published by `GetNodeInfo` (node defaults) and resolved per session for
  the authenticated user.
- How capabilities are granted is node policy. A self-hoster may grant everything to
  everyone; that is a supported configuration, not a degraded one.
- The reference node may fund storage, domains, and extravagance through a supporter tier —
  a node billing concern, invisible to the protocol.
- **Basic personal expression is never paywalled on any node running Patches:** having a
  Page, having a nameplate, having a handle, and exporting your data.
- Capabilities must not gate safety, moderation, or portability features.
- Where a capability is visible at all, it is a **server-attested badge** (§173), never
  user-set text, and never a ranking input.

Note for sequencing: payment processing and subscriptions remain explicit v0/MVP non-goals.
This ADR fixes the _shape_ of the answer now, because the protocol shape is expensive to
change later and the pricing decision is not.

## Consequences

- Pricing can change on the reference node without touching `.proto` files or client code —
  only the node's grant policy moves.
- Clients written against Patches work identically on a commercial node and a hobby node.
  Third-party clients never need to know what a supporter is.
- Self-hosting is a first-class configuration rather than the free tier of a hosted product.
- Feature flags proliferate instead of a single enum. That's the accepted cost: capabilities
  need naming discipline, an owner, and a documented default per node, or the message turns
  into a junk drawer.
- Migrating between nodes can mean losing a capability (custom fonts, more storage).
  Nameplate/page data is preserved on import but not rendered where unsupported (§173), so
  moving nodes degrades presentation rather than destroying content.
- The reference node still has to answer "what does supporter status get you" in product
  copy — this ADR only guarantees the answer is never "social standing" or "a rendered rank".

## Alternatives considered

- **A `tier` enum on the account.** Rejected: creates a protocol-level caste, breaks under
  federation and self-hosting, and turns pricing changes into protocol changes.
- **Hardcode limits in clients.** Rejected: clients would encode the reference node's
  economics, making every other node a second-class deployment and every limit change a
  client release.
- **No limits at all; trust everyone.** Rejected: storage and bandwidth are real costs a node
  operator must be able to bound, and an unbounded page-asset budget is an abuse vector
  before it is a generosity.
- **Server-enforced limits with no client-visible capability message.** Rejected: the client
  would only discover a limit by failing a write, which is a bad experience and makes
  honest, capability-aware UI impossible.
