# 0028. Federating social depth: reposts, then tags, then quotes

**Status:** Accepted
**Date:** 2026-08-22

## Context

Amendment B (§178–§195) shipped reposts, quotes, tags, communities and DMs as local,
single-node features, deliberately leaving their federation mapping to research
(`docs/research/activitypub-social-depth.md`, re-verified 2026-08-22 — see that note for
every citation and access date). Phase 18 starts turning that research into wire behavior.
Three facts force sequencing rather than a big bang:

- **Reposts** map onto W3C-Recommendation vocabulary (`Announce`/`Undo`, Activity
  Vocabulary §3.1) with exactly one open design question — the stability of the `Announce`
  activity id that a later `Undo` must name.
- **Tags** map onto a de facto convention (`as:Hashtag`, an AS2 extension term, not the
  Recommendation) that every mainstream server already speaks; the work is normalization
  honesty, not protocol risk.
- **Quotes** ride on FEP-044f, which is **still DRAFT** (received 2025-04-03) and gained its
  `QuoteRequest` flow after our first verification pass. It is the only one of the three
  whose wire contract can still change under us, and the only one that adds a **new
  remote-object fetch surface** (dereferencing `QuoteAuthorization` stamps to verify them,
  and re-dereferencing them later because revocation forwarding is best-effort).

Communities are explicitly not in play: §182.1 keeps them local in v0, and §193/§195.2
reserve federated communities for **their own ADR and owner sign-off**. The `Group`-actor
questions in the research note §4.3 were re-confirmed unanswered on 2026-08-22 (Mastodon's
ActivityPub page, updated 2026-03-30, still never mentions `Group`).

DMs and E2EE are a **hard prohibition**, not a sequencing decision: ADR
[0020](./0020-e2ee-direct-messages.md) §13 states that ADR "authorizes local-node E2EE
only" and that no DM key, prekey, envelope, report, or delivery path may cross the
`FederationGateway`. §194 and §195.6 remain unsatisfied for federated DMs. Nothing in
Phase 18 touches them.

## Decision

### 1. Order: reposts → tags → quotes

Phase 18 federates in that order — most-standard-footing first, draft-protocol last — with
each step shippable and revertable on its own. **Communities are deferred and stay
local-only** until a future ADR with owner sign-off (§195.2) re-verifies the research
note's §4.3 questions. No Phase 18 schema, service, or serializer may assume `Group`
actors, `audience` addressing, or any FEP-1b12 shape.

### 2. DMs and E2EE never federate

This ADR authorizes **no** DM, E2EE, key-discovery, or moderation-evidence traffic through
the federation seam, even when reposts/tags/quotes federate. ADR 0020 §13 and §12.11
(tests must prove no DM path crosses the `FederationGateway`) govern; relaxing them needs
§195.6 owner sign-off, current research, a cross-node threat model, and a new ADR.

### 3. Epoch and compatibility: strictly additive AS2 extensions

- Outbound objects and activities carry **new properties alongside legacy ones, never
  instead of them**. A federated quote post emits FEP-044f `quote` **and** all three
  legacy properties (`quoteUrl`, `quoteUri`, `_misskey_quote`) — the fallback combination
  the FEP itself recommends and Mastodon's spec page (verified 2026-08-22) documents
  accepting.
- Inbound accepts all four spellings. Multiple quotes on one object: first one wins
  (Mastodon's documented behavior). The `_misskey_quote` namespace IRI appears with and
  without a trailing slash in authoritative sources (FEP-044f vs Misskey's own extension
  page, both verified 2026-08-22) — inbound property-IRI matching must accept both.
- **Unknown or unsupported inbound shapes are silent no-ops**, never errors — the same rule
  the F1 inbox already applies to unrecognized `Update` objects. A draft protocol must not
  gain the power to make our inbox 5xx.
- No property Patches emits is ever required for basic interoperability (the §7.5 Pages
  rule): a plain Fediverse server that understands none of the quote properties still
  receives a valid post with a textual fallback.

### 4. Activity-id stability: outbound `Announce` ids are reconstructed, never minted

- A local repost's outbound `Announce` id is **deterministically reconstructed from the
  repost row** (`PUBLIC_ORIGIN`-derived URI shape over the repost's stable ids) — never
  `randomUUID()` per delivery. `Undo(Announce)` names exactly that URI as its `object`, so
  a peer can match the undo to the announce it already saw.
- Inbound is the mirror image: a remote `Announce`'s activity id is stored on the local
  pointer row (`reposts.remote_activity_uri`, P18-002) when ingested, so a later remote
  `Undo` finds the row by lookup, and one remote activity id can never claim two local
  repost rows (unique index).
- **Known flaw, out of scope here but tracked:** the existing `unfollow`/`unlike` paths
  mint a fresh random UUID for the inner activity on `Undo` instead of naming the original
  Follow/Like activity id (ticket B-079, `activitypub-federation-gateway.service.ts`).
  Phase 18's repost work must not replicate that pattern; fixing Follow/Like is a separate
  ticket with the same deterministic-id rule.

### 5. §109 gate extension: no new remote fetch surface without the full hardening

Quote verification dereferences remote `QuoteAuthorization` documents, and FEP-044f's
opportunistic re-verification re-fetches them periodically. That is a **new
remote-object fetch surface** and must reuse, not re-implement or bypass, the existing §109
stack: `safeFetch` (SSRF/private-IP filtering, redirect and response-size bounds,
timeouts), content-type validation, bounded JSON parsing, per-origin fetch budgets, and
TTL caching with **negative caching** (a stamp that failed verification is not re-fetched
per render). Any Phase 18 inbox code that fetches a remote object goes through that one
path; there is no second fetch implementation.

### 6. What does not move

- **No §109 security gate is weakened, reordered, or waived**, and **no §160
  federation-readiness checklist item is checked off by this ADR** — the checklist still
  shows F2 items open.
- **No §194 prohibition moves.** In particular: no votes/karma/scores ride across the
  seam; a repost/quote/like never changes feed position remotely either (as far as our
  emissions are concerned), and inbound content gets no ranking exemption.
- **§180.1 chronology is enforceable only locally.** A Patches node guarantees a repost
  never moves, bumps, or re-sorts the original post **on this node's timelines**. A remote
  server that receives our `Announce` renders and orders it by its own rules (Mastodon, by
  its own documentation, boosts into followers' timelines); we state that plainly instead
  of pretending the rule federates. The same holds inbound: ingesting a remote `Announce`
  obeys local block/mute/domain-block rules (§193) and never re-sorts local timelines.
- **Schema landed with this ADR (P18-002):** `reposts.remote_activity_uri` (nullable,
  unique-indexed) and the `quote_authorizations` lifecycle table (issue / verify / revoke
  per FEP-044f stamp evidence; one row per quote-post × quoted-post pair). Schema only —
  no inbox/outbox behavior is authorized by the migration alone.

## Consequences

**Positive.** The cheapest, best-standardized feature (reposts) ships first and proves the
deterministic-activity-id discipline; quotes land last with their risk contained behind
additive properties and no-op fallbacks, so a FEP-044f revision cannot strand us with a
broken inbox. Peers can always match our `Undo(Announce)` to its `Announce`. The §109 stack
stays single-sourced.

**Costs and limits.** Emitting four quote properties is redundant on the wire until the
legacy ones die (bounded cost; remove later with a compatibility check, not silently).
Deterministic ids mean a repost row must never be deleted-and-recreated while remote peers
hold its `Announce` id — unrepost/re-repost is a new activity id by design, which is
correct but must be respected by any future repost-row compaction. Storing remote
`Announce` ids adds a column whose integrity depends on inbox dedupe (`inbox_activities`)
holding. `quote_authorizations` rows accumulate and need a retention story before quotes
ship (revocation is a state flip, not a delete). And the local-only reach of §180.1 means
"chronological" is a node property, not a network property — product copy must not claim
otherwise.

## Alternatives considered

- **Quotes first** (they carry the most product excitement). Rejected: the only
  draft-footed, fetch-surface-expanding feature goes last by rule, not first by enthusiasm.
- **All three at once.** Rejected: couples W3C-Recommendation work to a draft FEP; a
  FEP-044f change would block reposts for no architectural reason.
- **Emit only FEP-044f `quote`, skip legacy properties.** Rejected: the FEP itself
  recommends the fallbacks, and Mastodon 4.4-era peers (and Misskey/Fedibird) read the
  legacy names; a single-property emit maximizes purity at the cost of reach, which is the
  opposite of what federation is for.
- **Store outbound `Announce` ids on the repost row instead of reconstructing them.**
  Rejected: reconstruction cannot drift from the row, survives DB-only restore paths, and
  keeps `remote_activity_uri` unambiguous (inbound-only semantics; null means "locally
  originated"). A stored outbound id would be a second source of truth for something
  already derivable.
- **Authorize communities now behind a flag.** Rejected: §195.2 reserves federated
  communities for owner sign-off with their own ADR; a flag is authorization with extra
  steps.
- **Federate DMs alongside social depth.** Not an alternative — prohibited by ADR 0020
  §13 and §194/§195.6.
