# 0021. Filter-list subscription scopes are a `text[]` on the subscription row, defaulting to every scope

**Status:** Accepted
**Date:** 2026-08-19

## Context

`INITIAL_VISION.md` §199.1 describes a filter-list subscription as choosing "an action and scopes
the subscriber chooses" — the same per-scope narrowing a personal filter already has via
`filter_scopes` (§198.1, a join table keyed to `FILTER_SCOPES`: `HOME`, `LOCAL`, `TAG_FEED`,
`COMMUNITY_FEED`, `NOTIFICATIONS`, `SEARCH`, `MESSAGE_REQUESTS`). The shipped P14-001 proto
contract (`SubscribeFilterListRequest`) omitted the field, so `loadEffectiveFilterRules`
(`apps/server/src/modules/filters/filter-matching.ts`) applied every list-derived rule to every
scope regardless of what the subscriber actually wanted — a real gap against §199.1, not a
documented v0 limitation, since a subscriber to a NSFW-focused list had no way to say "only in my
home feed, not in search."

## Decision

Add `scopes` to both `SubscribeFilterListRequest`/`FilterListSubscription` (proto) and
`filter_list_subscriptions.scopes` (a plain `text[]` column, not a second join table — a
subscription is a single row per `(actor, filter_list)` and the set is small and bounded, unlike
`filters`, which can have many rows per actor). Empty input at write time (proto default, or a
row from before this migration) is normalized to **every** scope, at both the service layer
(`FilterListService.subscribeFilterList`) and the column's own `DEFAULT`, so nothing narrows
silently on upgrade. `loadEffectiveFilterRules` performs the intersection: a subscription
contributes its list's rules only for a request's own `scope` when that scope is in the
subscription's `scopes`, exactly mirroring how a personal filter's `filter_scopes` already gates
inclusion.

## Consequences

**Positive.** A subscriber can narrow a filter list to the contexts they actually want it in,
closing the §199.1 gap without introducing a new evaluation path — `loadEffectiveFilterRules`
gained one `.filter()` call, not a second code path. The SQL-pushdown optimization added
alongside this (P14-021, hide-action `ACTOR`/`TAG` rules pushed into the feed/search query) reads
the same already-scope-filtered rule set, so it stays correct for free.

**Negative.** `scopes` is evaluated in-process (`.filter()` over a subscriber's typically-small
subscription list) rather than pushed into the subscription lookup's own SQL — acceptable because
`MAX_LABELER_SUBSCRIPTIONS_PER_ACTOR`-scale row counts per actor make this a non-issue, but it
means a subscription with an enormous number of scopes gains nothing from an index.

## Alternatives considered

**A second join table (`filter_list_subscription_scopes`), mirroring `filter_scopes`.** Rejected —
`filter_scopes` exists as a join table because a single filter's `scope` set is queried alongside
many other filters' term rows in the same pass; a subscription's scopes are only ever read as a
whole alongside the one subscription row they belong to, so a `text[]` column avoids a join for no
loss of expressiveness.

**Leave list-derived rules applying to every scope (the pre-existing behavior) and treat this as
a documented limitation.** Rejected — §199.1 is explicit that scope choice belongs to the
subscriber, and the gap was a shipped-contract oversight, not a deliberate simplification.
