---
name: tanstack-query-invalidate-key-must-match-canonical-not-url-casing
description: A TanStack Query cache key built from raw URL params silently desyncs from an invalidateQueries call keyed off canonical server-resolved data, when the lookup is case-insensitive
metadata:
  type: feedback
---

If a route's query key is built from a raw URL param (e.g. `['page', urlHandleParam]`) but a
sibling mutation's `invalidateQueries` targets the *canonical* form of that same identifier (e.g.
`['page', actor.handle]` from an already-resolved API response), and the server-side lookup for
that identifier is case-insensitive but returns canonical casing, the two can silently diverge:
a case-mismatched URL means invalidate never matches, and a save leaves stale cached data on
screen until a hard reload.

**Why:** Found in Patches' `apps/web/src/routes/ProfileRoute.tsx` (`B-115`) — `pageQuery` was
keyed by `profileHandle` (verbatim from `/@handle`), while `EditWallDialog`'s
`invalidateQueries({ queryKey: ['page', handle] })` used `actor.handle` (server's canonical
casing from `getActorByHandle`, which does a case-insensitive `handleNormalized` lookup).

**How to apply:** When a query key is derived from a URL/user-typed identifier that the backend
also resolves case-insensitively (or otherwise normalizes), key and fetch by the canonical
resolved value once it's available, not the raw input — and check every sibling
`invalidateQueries`/`setQueryData` call in the same feature actually targets that same key shape.
