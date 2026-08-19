# 0019. Server-evaluated user filters, opt-in non-ranking lists/labelers, and appealable node moderation

**Status:** Accepted
**Date:** 2026-08-18

## Context

Amendment C (`INITIAL_VISION.md` §196–§210) gives Patches a privacy posture and a moderation
model that does not depend on one authority being right for everyone, stated once as: "Moderation
is a service you subscribe to, not a truth you are subject to." Three questions needed a decision
before implementation, because each one determines the data model and cannot be revisited cheaply
once shipped.

**Where does a personal filter live?** §111 originally sketched "built-in client feed filters" —
a per-client convenience. But Patches supports third-party clients by design (§175, pillar 5), and
a filter that lives in one client silently fails in every other. Keyset pagination (§46, §153)
also breaks if filtering happens after the page is already built, because `hide` must omit rows
entirely to be a real guarantee rather than a client hint a non-compliant client can ignore
(contrast Mastodon's `Status.filtered`, which every status carries regardless of the viewer's
filters).

**Can a shared list ever act on your behalf?** Community-run and mass "block lists" have caused
real, uncorrectable harm elsewhere: a list author gains the power to sever relationships for every
subscriber, silently, at any time. Bluesky's split between `listblock` (public, destructive) and
`muteActorList` (private, non-destructive) is the closest prior art, and it works because the two
are named and scoped differently.

**Does decentralizing moderation weaken the node's own floor?** §64–§66 already require reports,
review, and an audit log. Nothing about giving users filters, lists, and labelers should make node
enforcement less accountable — if anything, adding an appeal path and a public log is the point at
which "the node enforces its rules" stops being a promise nobody can verify.

## Decision

1. **Filters (§198) are evaluated server-side**, at the same chokepoint (`applyVisibilityFilter`
   in the feeds module) that blocks, mutes, and visibility already flow through. Match terms are
   **literal only** — no user-supplied regex — because filters run against every candidate row for
   every viewer with no linear-time regex engine in Node, and a pathological pattern would be a
   node-wide denial of service written by a user with an account (§198.2). `hide` omits rows on
   the server; `collapse`/`warn` return a `filtered_by` hint for the client to render.
2. **Filter lists (§199) are data, not authority.** Publishing a list carries no action; a
   subscriber chooses the action and scope. **A subscription can never create a block** — only a
   deliberate, one-at-a-time promotion of a single entry can. Entries are evaluated live against
   the list's current state, never copied, so unsubscribing is instant and complete, and
   subscriber counts are never published (§199.2–§199.3).
3. **Labelers (§200) publish from a closed, node-published vocabulary** — no free-text values, no
   numbers, no scores. A label is visible only to a labeler's own subscribers and never affects
   ordering. The labeled person is never notified; a labeler's authority stops at its own labels.
4. **The node floor (§201) is unchanged and made accountable.** Every node enforcement action now
   produces a moderation notice, an appeal window, and an anonymized public log entry. Account-
   and post-level log entries deliberately carry no identifying subject — the log is transparency
   about the node's conduct, not a public record of an individual's conduct, which would itself be
   a harassment vector.

## Consequences

**Positive.** Every client sees the same timeline, because filtering happens once, server-side.
Safety is portable — filters export/import as plain JSON and travel with an account. Shared
curation can grow (filter lists, labelers) without ever reintroducing ranking, karma, or a block
oracle. Node enforcement gets a paper trail and a right of reply without weakening it.

**Negative — stated plainly.** No regex means some filter authors will find literal terms less
expressive; RE2 support is deferred to a future sign-off (§210.1) rather than shipped now.
Anonymizing public-log entries means the log cannot answer "was @handle banned?" — that trade is
deliberate (§201.4) but is a real loss of transparency some users will ask for back. Filters are
evaluated over a bounded server-side over-fetch for non-indexable term kinds (§198.4), which is
more expensive than a client-side filter would have been, and is accepted because correctness
under pagination is non-negotiable (§153).

## Alternatives considered

**Client-side filters (§111's original A1 shape).** Rejected — fails the moment a second client
exists, and cannot guarantee `hide` at all.

**Subscribable lists that block directly (a "block list" primitive).** Rejected — hands a list
author unilateral, silent power over every subscriber's relationships; the harm pattern is
documented on other networks and the fix (splitting mute from block, subscriber decides) is
already proven prior art (§199.2).

**Free-text or scored labels (AT Protocol's permissive model).** Rejected — a bounded vocabulary
enforces mechanically what a permissive spec can only request socially, and keeping §194's ban on
scores true at the edges requires exactly that mechanical enforcement (§200.2).

**Leave node moderation as-is, ship only the opt-in layer.** Rejected — an unaccountable floor
underneath an accountable opt-in layer is backwards; the parts of this amendment that matter most
for trust are the notice, the appeal, and the log, not the filters.
