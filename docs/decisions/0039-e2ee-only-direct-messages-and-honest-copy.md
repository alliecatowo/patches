# 0039. E2EE-only direct messages and honest client disclosures

**Status:** Accepted  
**Date:** 2026-08-30  
**Amends:** Amendment B §183.1 and the related §194 client-copy prohibition; [0017](./0017-server-visible-dms.md)'s client-disclosure requirement  
**Supersedes:** the server-visible-DM client-copy rule from §183.1  
**Builds on:** [0020](./0020-e2ee-direct-messages.md), [0030](./0030-pre-alpha-consolidation-policy.md), and [0036](./0036-shipping-e2ee-conditions-capability-states-and-copy.md)

## Context

The original v0 decision made direct messages server-visible and required every client to say so.
That mode was subsequently removed under ADR 0030: `LEGACY_SERVER_VISIBLE` is reserved, the
plaintext RPCs and message-request flow are deleted, and `E2EE_V1` is the only conversation mode.
ADR 0020's owner authorization and the shipped E2EE implementation therefore make the unconditional
§183.1 client-copy rule stale. Keeping it in the agent instructions causes new work to reintroduce a
mode that the protocol no longer supports.

This amendment records the owner's 2026-08-25 approval to remove that gate. It changes the required
disclosure, not the cryptographic or moderation guarantees of ADR 0020.

## Decision

1. All direct messages offered by Patches use `E2EE_V1`. There is no plaintext or server-visible
   fallback, and a client or node that cannot support the required E2EE capability does not offer a
   DM function.
2. Clients must use honest, capability-based copy. They may describe a conversation as
   end-to-end encrypted only when the negotiated mode is `E2EE_V1` and the shared disclosure helper
   permits that wording. They must state real limitations, such as a client lacking encryption keys,
   an unavailable node capability, or an experimental/unreviewed state. They must not replace those
   facts with generic claims such as “secure,” “private,” or “effectively encrypted.”
3. The old requirement to display a server-visible-DM disclaimer is retired. Historical ADRs and
   migration records may continue to describe the mode they governed, but active instructions and
   user-facing copy must not present it as a reachable v0 mode.
4. The following constraints remain unchanged: DM bodies, keys, and plaintext must never appear in
   logs, metrics, traces, errors, notifications, or administrative output; and DMs/E2EE never cross
   the federation seam. DMs remain local to the node, as required by ADR 0020 §13 and §194.

## Consequences

Clients can accurately identify the protection they actually provide without implying that the node
can read message bodies. Operators and users must understand the metadata limitation: the node can
still observe delivery metadata such as participants, timing, and coarse ciphertext size. Clients
without a usable E2EE runtime must provide an unavailable/terminal-only path rather than silently
downgrading or presenting a misleading send affordance.

The former server-visible moderation evidence path is not restored. Reports can include content only
when a client explicitly discloses it through the E2EE reporting flow; server telemetry remains
content-free.

## Alternatives considered

- **Keep the §183.1 disclaimer everywhere:** rejected because the server-visible mode and its
  plaintext surfaces were deleted by ADR 0030, making the statement false for shipped DMs.
- **Permit a server-visible fallback for clients without E2EE:** rejected because it would revive the
  deleted mode and create an unsafe downgrade path.
- **Use generic “secure” or “private” language:** rejected because it hides capability and metadata
  limitations. Copy must name E2EE only when the actual mode and helper authorize it.
