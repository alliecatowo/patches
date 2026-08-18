# 0013. Patches is node software; `patches.social` is the reference node

**Status:** Accepted
**Date:** 2026-08-17
**Relates to:** [0006](./0006-activitypub-later.md) (federation deferred behind a seam)

## Context

The spec was written in a centralized voice: "Primary backend: NestJS", "the backend must
not embed terminal-specific assumptions", "posts originating on the current Patches
instance". The federation-aware data model (§19–§21, §110) was there from day one, but the
_product_ framing was one deployment that other software might someday talk to.

That framing quietly decides things it shouldn't. If `patches.social` is "the backend", then
self-hosting is a port, other nodes are guests, and every design question resolves toward the
central deployment by default. If instead Patches is social-server software and
`patches.social` is one node running it, then self-hosting is the product working correctly,
and the reference deployment has no special privileges in the protocol.

ADR 0006 deferred federation behind a `FederationGateway` seam and staged it F0→F3, with
§143 scheduling the two-instance lab at 0.5 — after feed customization and identity
personality. Practical problem: federation assumptions that are wrong get _cheaper_ to fix
the earlier they're tested, and a two-node lab is the only thing that actually tests them.
Waiting until 0.5 means five releases of accumulated assumptions validated by nothing.

## Decision

**Patches is social-server software. A deployment is a node. `patches.social` is the flagship
hosted node — the reference node — not "the backend."** See `INITIAL_VISION.md` §163, §176.

- Identity is `@handle@domain`; a handle is unique only within a node. Each node is
  authoritative for its own local actors and nothing else.
- No global user database, central account service, central directory, or registry that a
  node needs in order to function. A node must be fully operable standalone.
- Nodes publish their own policy (registration mode, limits, capabilities) via `GetNodeInfo`
  rather than clients hardcoding the reference node's behavior.
- Self-hosting is a shipped goal: `docker run`/Compose, documented env, no proprietary
  dependency (any S3-compatible store, any SMTP endpoint).

Federation moves earlier in the release sequence, while every security gate stays where it
is:

| Release | Contents                                   | Stage |
| ------- | ------------------------------------------ | ----- |
| v0.0    | Single-node social loop (Phases 0–7 + 4.5) | F0    |
| v0.1    | Two-node Patches↔Patches federation lab    | F1    |
| v0.2    | Self-hostable node release                 | F1    |
| v0.3    | Mastodon/Pixelfed interoperability         | F2    |
| v0.4    | Identity portability / migration           | F2    |
| v1.0    | Public federation                          | F3    |

Non-negotiables preserved:

- "Finish the centralized vertical slice first" (§0) is unchanged — Phases 1–6 ship before
  any federation code.
- The v0.1 lab is §108's Stage F1 verbatim: **local, two nodes, non-public.**
- Every §109 control is a hard gate before any node exposes federation to the Internet, and
  the §160 checklist gates v1.0 in full.
- **A self-hosted node ships with federation disabled by default.** Shipping the software to
  other operators does not lower the federation security bar — it raises it, because the
  operator inherits it and cannot be assumed to have read §109.

Portability gets a seam now and a feature later: `actors.moved_to_uri` and `also_known_as`
exist from the Phase 1 schema, unused until v0.4, with bidirectional verification required
before any move is honored. Data export is available regardless and is never gated behind a
capability, tier, or payment.

## Consequences

- Node-scoped thinking becomes mandatory everywhere: handles are ambiguous across nodes,
  sessions are per-node (§169), and "local" means "this node". The TUI grows an account
  manager rather than one implicit connection.
- Federation assumptions get tested at v0.1 instead of v0.5 — four releases earlier, when
  changing the actor/URI/delivery model is still cheap.
- v0.2 means strangers running this code. That imposes operational obligations the project
  didn't previously have: a release process, upgrade/migration notes, a security contact,
  and a config surface that is safe by default rather than safe-if-you-read-the-docs.
- Deferring the self-hostable release to v0.2 (after the lab) is deliberate: shipping
  self-hosting _before_ two nodes have ever talked to each other would mean distributing
  software whose central promise is untested.
- Pushing Mastodon interop to v0.3 accepts that early self-hosters can only talk to other
  Patches nodes for a while. That's the honest sequencing — Patches↔Patches must work before
  ecosystem compatibility is a meaningful goal.
- Some cost is accepted: node-awareness in the client is work that a single-deployment
  product wouldn't need, and it lands before there is a second node to point at.

## Alternatives considered

- **Keep the centralized framing; treat self-hosting as a later port.** Rejected: the
  framing leaks into schema, client, and product decisions, and retrofitting node-awareness
  after `@handle` is assumed globally unique is a migration, not a refactor.
- **Move federation even earlier, in parallel with the social loop.** Rejected: prohibited by
  §0 and by ADR 0006's reasoning, which still holds — there must be a working product before
  there is anything worth federating.
- **Ship self-hosting at v0.1, before the federation lab.** Rejected: distributes software
  whose core promise is unproven, and makes the first upgrade path an experiment on other
  people's deployments.
- **Enable federation by default in self-hosted builds.** Rejected: hands hostile-input
  ingestion to operators who have not read §109 and cannot be assumed to have configured
  domain blocking. Off by default, on by informed choice.
- **AT Protocol / a custom protocol.** Rejected — unchanged from ADR 0006.
