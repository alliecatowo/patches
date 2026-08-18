# 0006. ActivityPub federation deferred behind a gateway seam

**Status:** Accepted
**Date:** 2026-08-17

## Context

Federation (via ActivityPub, the W3C-recommended protocol built on ActivityStreams 2.0) is
a stated long-term goal for Patches — the product is explicitly inspired by the Fediverse
and open protocols. But federation means ingesting hostile Internet input: remote actors,
signature verification, SSRF-prone URL fetching, domain-level moderation, and durable
retryable delivery. Building that before the centralized product works would multiply
architectural risk and security surface before there's a working social product to
federate at all.

## Decision

Federation is architecturally seamed in from day one, but not implemented until later
milestones. A `FederationGateway` interface is defined early:

```ts
interface FederationGateway {
  publishActor(...): Promise<void>;
  publishPost(...): Promise<void>;
  publishDelete(...): Promise<void>;
}
```

The v0 implementation is a `NoopFederationGateway` — domain services call the interface, but
nothing goes over the network. The data model is federation-aware from the start (local vs.
remote actors, canonical URIs, origin/home-server, tombstones, visibility) so remote
entities fit the existing tables later without a schema rewrite (`INITIAL_VISION.md` §110).
Federation itself proceeds in stages — F0 (schemas only, current), F1 (two-instance lab,
Patches-to-Patches), F2 (interoperability with mainstream ActivityPub implementations), F3
(public federation) — gated by the federation readiness checklist in
`docs/product/roadmap.md`. Public federation is not enabled until moderation and security
controls (SSRF defenses, signature verification, domain blocking, bounded retries, remote
response size/timeout limits) exist and are exercised.

## Consequences

- Domain services depend on an interface, not on ActivityStreams JSON shapes, so the
  eventual real implementation doesn't require rewiring `PostsModule`/`ActorsModule`
  internals — only swapping the gateway implementation.
- The centralized product (auth, posting, feeds, moderation) gets built and hardened first,
  which is also where most of the actual user-facing value is in v0/MVP.
- Federation security work (SSRF protection, signature verification, domain blocking) is
  substantial and is treated as a hard gate, not a "nice to have" bolted on after public
  federation is already live — deliberately avoiding a common Fediverse-implementation
  failure mode.
- Some future rework is accepted as the cost of not over-building federation machinery
  speculatively: the real ActivityPub implementation, when it arrives, may reveal gaps in
  the F0 schema assumptions that require migration.
- Until Stage F1+, "federation" is aspirational in the codebase — a stub, not a feature.
  This document exists partly so nobody mistakes the `NoopFederationGateway` for progress
  toward F1.

## Alternatives considered

- **Build ActivityPub federation from the start, in parallel with the core product.**
  Rejected: explicitly prohibited (`INITIAL_VISION.md` §0 — "do not implement federation
  before the centralized product works"). Would roughly double security surface and
  architectural risk before there's a working product to protect.
- **AT Protocol instead of ActivityPub.** Rejected: the spec is explicit that ActivityPub is
  the first federation target, given its W3C standardization and alignment with the
  Fediverse the product draws inspiration from.
- **No federation seam at all — bolt it on whenever it's built.** Rejected: retrofitting
  local/remote actor and canonical-URI concepts onto an already-live schema would be far
  more disruptive than modeling them from the start, even while unused.
