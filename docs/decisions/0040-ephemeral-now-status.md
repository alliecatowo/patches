# 0040. Ephemeral Now status is non-story state

**Status:** Proposed — owner approval required before implementation  
**Date:** 2026-09-01  
**Depends on:** [0018](./0018-tui-interaction-model.md), [0019](./0019-user-side-filters-and-decentralized-moderation.md), and Amendment B §§178–195

## Context

Issue #179 asks for a contract for a short-lived `Now` status before the server work in
#180 or the TUI work in #181 begins. The product needs a lightweight way for an actor to
say what they are doing at the moment, but the feature must not become a second post
type, a presence beacon, a social score, or an algorithmic input. The existing
specification requires chronological timelines and prohibits engagement ranking,
trending, votes, karma, scores, and activity-derived recommendations.

The proposal is intentionally blocked until the owner approves the exact constraints
below. This ADR does not authorize schema, protobuf, service, or client changes.

## Decision

Subject to owner approval, `Now` is a single replaceable status document attached to an
actor. It is ephemeral, non-story state: it is rendered in the actor's profile/nameplate
context and in an explicitly opened Now view, but it is not a post and is not inserted
into any timeline.

### Non-story invariants

1. A Now status has no author-visible body history, permalink, reply tree, repost,
   quote, like, reaction, bookmark, edit history, or attachment.
2. Creating, replacing, viewing, expiring, or deleting a status MUST NOT change the
   position of any post, follow, recommendation, notification, unread count, or feed
   result. No ranking, sorting, score, vote, trend, or recommendation input may be
   derived from it.
3. An actor has at most one active status. Replacement is an atomic overwrite; it does
   not create a story or an audit-visible revision for clients.
4. The status is bounded by a server-enforced expiry. The proposed default maximum
   lifetime is 24 hours, with an actor-selectable expiry no later than that maximum.
   Expiry is based on server time, not client clocks.
5. Explicit deletion makes the status unavailable immediately. Expiry and deletion are
   idempotent and leave no client-readable tombstone.

### Visibility and privacy

1. The owner chooses one of two audiences at creation: `PUBLIC` (anyone who can view
   the actor's profile) or `FOLLOWERS` (the actor's current followers). There is no
   per-recipient selection, quote, forwarding control, or federation audience.
2. A viewer who is not in the selected audience receives the same absence result as a
   viewer with no active status. The API MUST NOT reveal existence, text, timestamps,
   or expiry through errors, counts, notifications, or timing-sensitive distinctions.
3. Now is node-local. It never crosses the federation seam, is not included in exports
   or public activity feeds, and is not used to infer continuous online presence.
4. The server may retain the minimum non-content operational record required for expiry,
   abuse handling, and security audit, but logs, metrics, traces, and errors MUST NOT
   contain status text or unredacted identifiers that expose it.

### Moderation and safety

1. The node may apply the same account, block, and moderation policy used for profile
   text. Moderation can suppress or remove a status without creating a post-like public
   event.
2. Admin/security audit records may record that a moderation action occurred, its actor,
   reason code, and timestamps, but never copy status text into logs or metrics.
3. Reporting a Now status, if supported by the later moderation contract, must use a
   content-minimizing flow and must not turn the status into a durable public artifact.
   That reporting surface is not part of this ADR's implementation scope.

### Client behavior

1. Clients label the surface `Now` and render it as current profile context, never as a
   post, notification, timeline item, or message.
2. Clients must show the effective expiry to the owner, use server-provided timestamps,
   and remove stale cached content at or before the advertised expiry. A refresh may
   confirm absence but must not extend lifetime.
3. Clients must provide explicit set, replace, and delete actions, and must not imply
   that a status means the actor is online, available, or responding.
4. Plain mode and terminal capability fallback remain available. Rendering is text-only
   in v0: no animated presence indicator, custom media, or client-only status that is
   presented as server state.

### Approval and implementation boundary

Owner approval must explicitly accept the audience values, the 24-hour maximum, the
absence semantics, the node-local boundary, and the moderation/audit limits above.
Until that approval is recorded, #180 and #181 MUST NOT implement a Now field, RPC,
table, cache, or UI affordance. After approval:

- #180 may define storage and expiry plus additive protobuf/controller/application
  surfaces that express set, get, replace, and delete. It must preserve the invariants
  here and must not return TypeORM entities over gRPC.
- #181 may add the TUI profile/nameplate rendering and owner controls, including loading,
  stale-cache removal, and the non-presence copy. It must not place Now in a timeline or
  invent client-only semantics.
- Any change to lifetime, audience, federation, moderation retention, or story-like
  interactions requires an amendment to this ADR before implementation.

## Consequences

The feature supplies lightweight current context without competing with posts or
creating an engagement loop. A strict expiry and absence-equivalence rule reduce stale
and presence-leak behavior, while the explicit audience remains understandable to
clients. The node still needs a clock-driven cleanup/read path and careful cache
invalidation. A status cannot be recovered as history after expiry or deletion, and the
first version intentionally cannot express a private custom audience or rich media.

## Alternatives considered

- **Model Now as a post with a short TTL.** Rejected: even a hidden post carries story,
  timeline, interaction, and history semantics that this proposal must exclude.
- **Expose online/typing presence and derive Now from it.** Rejected: continuous
  presence leaks availability and conflicts with the existing presence cautions.
- **Put Now in the home or local timeline.** Rejected: it creates ordering and attention
  semantics, even if the initial implementation claims to be chronological.
- **Store an unbounded status history.** Rejected: it turns ephemeral context into a
  durable diary and expands privacy, export, moderation, and deletion obligations.
- **Allow arbitrary recipient lists or federation.** Rejected for v0: it complicates
  audience privacy and crosses a seam that this status does not need.
