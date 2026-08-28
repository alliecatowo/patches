# Realtime surface audit (#207)

**Status: implemented (audit only — no code changes).** Patches has no push infrastructure and
no streaming RPCs (§56, §183.3, ADR 0032) — every surface that updates without a full page
reload is either a polling `setInterval`/`refetchInterval`, a pull-to-refresh gesture, or a
manual refresh action. This document inventories every surface a user would expect to update
live, states its actual mechanism and interval (with `file:line`), and names the gap where one
exists. It complements, and does not duplicate, ADR 0032
(`docs/decisions/0032-dm-delivery-stays-poll-based.md`), which is the authoritative freshness
SLA for DMs and the unread badge specifically — this document's DM row is a pointer to that ADR,
not a restatement of its evidence.

Read this before adding a new realtime surface, or before proposing streaming/push for any one
of these — ADR 0032's reasoning (no long-lived connection, no cross-machine bus, presence-leak
risk under Amendment B §4.2) applies to every row below, not just DMs, and a future streaming
proposal for a non-DM surface should explain why that reasoning doesn't apply rather than
silently assuming DMs were a special case.

## Method key

- **Interval poll** — `setInterval`/TanStack Query `refetchInterval`, fires on a fixed cadence
  while the screen/tab is active.
- **Pull-to-refresh** — user gesture only; no background refresh at all.
- **Manual refresh** — an explicit keybind/button (`Ctrl+R` in the TUI); no background refresh.
- **Mount-only** — fetched once when the component mounts/route is entered; nothing refreshes it
  short of navigating away and back. This is the "never refreshes" defect class ADR 0032 named
  for DMs (P19-017) — several other surfaces share it and are called out below.
- **Invalidate-on-mutation** — refetched only when the same client performs a write that the app
  already knows should have changed this data (e.g. liking a post invalidates that post's query).
  This never reflects another user's action.

## Home and local timelines

| Client | Mechanism                                                                            | Interval / trigger                                                                                                                                                | Source                                           |
| ------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Web    | Interval poll for a "new posts" pill, separate from the paginated list itself        | **30 s**, only while `PostTimeline` is mounted; the pill requires a click to actually merge the new page into the visible list — arriving posts never auto-insert | `apps/web/src/components/PostTimeline.tsx:53,58` |
| TUI    | Manual refresh only (`feedNonce` cache-buster driven by the shell's global `Ctrl+R`) | none — matches spec §56's "poll when active and refresh manually" for the TUI specifically                                                                        | `apps/tui/src/hooks/usePaginatedPosts.ts:100`    |
| Mobile | Pull-to-refresh only                                                                 | none                                                                                                                                                              | `apps/mobile/src/screens/HomeScreen.tsx:109`     |

**Gap:** web's 30 s "new posts" check only ever tells the user something is new; it does not
freshen the list. This is by design (§4.2's "addictive notification frequency optimization" bar
argues against auto-inserting content the user is mid-read on), not an oversight — noted here so
a future change to this behavior is a deliberate product call, not a silent regression.

## Thread replies

| Client | Mechanism                                                                                  | Interval / trigger                                                                               | Source                                                               |
| ------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Web    | Mount-only (`useInfiniteQuery`, no interval, `refetchOnWindowFocus: false` global default) | none — a reply posted by someone else while you're reading never appears without a manual reload | `apps/web/src/routes/ThreadRoute.tsx:52`, `apps/web/src/main.tsx:72` |
| TUI    | Manual refresh only (`refreshKey` prop, driven by the same global `Ctrl+R`)                | none                                                                                             | `apps/tui/src/screens/ThreadScreen.tsx:26,130`                       |
| Mobile | No dedicated thread/reply screen exists yet                                                | n/a                                                                                              | `apps/mobile/src/screens/` (no thread screen)                        |

**Gap:** web thread replies are mount-only with no manual-refresh affordance at all (no `Ctrl+R`
equivalent exists on the web client) — a user reading an active thread has no way to see new
replies short of a full navigation away and back. This is the same defect class ADR 0032's
P19-017 fixed for the DM conversation list; it has not been fixed here.

## Notifications list

| Client | Mechanism                                                                                         | Interval / trigger             | Source                                                   |
| ------ | ------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------- |
| Web    | Mount-only, plus `invalidateQueries(['notifications'])` after the client's own mark-read mutation | none for another user's action | `apps/web/src/routes/NotificationsRoute.tsx:53,81`       |
| TUI    | Mount-only                                                                                        | none                           | `apps/tui/src/screens/NotificationsScreen.tsx`           |
| Mobile | Pull-to-refresh only                                                                              | none                           | `apps/mobile/src/screens/NotificationsScreen.tsx:60,102` |

**Gap:** the notifications _list_ itself is mount-only on both web and TUI — only the separate
unread _badge_ (below) polls. A user sitting on the notifications screen does not see a new
notification arrive; they see the badge elsewhere in the UI increment (web) or not at all (TUI,
since the badge and the open notifications screen are different components) without a manual
reload/reopen.

## Unread badge

| Client | Mechanism     | Interval                                        | Source                                                                                                       |
| ------ | ------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Web    | Interval poll | **30 s** (ADR 0032 §1)                          | `apps/web/src/routes/RootLayout.tsx:49`, `apps/web/src/lib/poll-intervals.ts` (`WEB_UNREAD_BADGE_POLL_MS`)   |
| TUI    | Interval poll | **60 s**, plus a refresh on every screen change | `apps/tui/src/hooks/useUnreadCount.ts:42`, `apps/tui/src/app/poll-intervals.ts` (`TUI_UNREAD_BADGE_POLL_MS`) |
| Mobile | None at all   | —                                               | no unread-badge poll exists (ADR 0032's table, confirmed unchanged in this pass)                             |

This is the one surface with a published freshness SLA — ADR 0032 §1 — because it feeds directly
into the DM freshness promise table there. See that ADR rather than duplicating its numbers here.

## Follow / repost / quote arrival

There is no dedicated "arrival" surface for these — they only become visible to the acted-upon
user through the notifications list/badge above (a follow, repost, or quote generates a
notification row) and through the acted-upon content's own counters, which are refreshed the
same mount-only/invalidate-on-mutation way as everything else:

| Surface                                        | Mechanism              | Interval / trigger                                                                                                                                                                                 | Source                                                                              |
| ---------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Follower/following counts (web profile)        | Mount-only             | none — following someone in another tab never updates an already-open profile                                                                                                                      | `apps/web/src/routes/ProfileRoute.tsx:102,108` (`followersQuery`, `followingQuery`) |
| A post's repost/quote/like counts (any client) | Invalidate-on-mutation | only the acting client's own like/repost/quote refreshes that post's card; another actor's repost of the same post is invisible until the surrounding list (timeline/thread, above) next refreshes | `apps/web/src/components/PostCard.tsx` and equivalents                              |

Per Amendment B, none of repost/quote/like/pin/edit ever changes feed position even once
observed (§184-class rule already enforced elsewhere in the codebase) — this audit only concerns
_visibility_ of the count/notification, not ordering, which is out of scope for this document.

## DMs

Fully covered by ADR 0032 (`docs/decisions/0032-dm-delivery-stays-poll-based.md`), including the
published freshness SLA, the re-open gate for reconsidering streaming, and why a streaming RPC
was rejected for v0. Not restated here.

## Summary: what would need to change under a future streaming design

If a future ADR revisits ADR 0032's re-open gate (T1/T2/T3) and decides to add a push/streaming
mechanism, the surfaces above that would need it too — not just DMs — are, in rough order of
user-visible staleness today:

1. **Thread replies (web)** — the most silent gap: mount-only with no manual-refresh affordance
   at all, unlike every other surface in this table.
2. **Notifications list (web, TUI)** — badge already polls/updates; the list itself does not,
   so the two can visibly disagree (badge says N unread, open list doesn't show the Nth item).
3. **Follower/following counts and timeline "new posts" pills** — lower urgency; these are
   summary/discovery surfaces, not conversations, and the existing manual-refresh-or-pill pattern
   is a closer fit to Amendment B's anti-addictive-frequency framing than an auto-updating count
   would be.

None of the above is a decision to build anything — per ADR 0032's own scope, this document is
audit only, and any of these would need their own product/architecture sign-off before
implementation, the same as DMs did.
