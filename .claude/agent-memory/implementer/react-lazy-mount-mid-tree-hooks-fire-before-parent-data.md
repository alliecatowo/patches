---
name: react-lazy-mount-mid-tree-hooks-fire-before-parent-data
description: A child component conditionally added to the tree only once a parent query becomes enabled mounts with that query's data still undefined — its useState initializer freezes on empty
metadata:
  type: feedback
---

When a parent only renders `<Child prop={query.data?.field} />` inside a branch gated on the same
condition that flips `enabled: true` on that query (e.g. a tab switch), the child's first mount
happens at the exact moment the fetch _starts_, not after it resolves. A `useState(() =>
deriveFrom(prop))` initializer in that child permanently freezes on the pre-fetch value — it only
runs once, and the child doesn't unmount/remount on data arrival since it stays in the tree via a
`return null` early exit rather than being removed.

**Why:** Found in Patches' `apps/web/src/components/EditWallDialog.tsx` — the wall editor's block
list stayed empty forever because `ProfileRoute`'s `pageQuery` (`enabled: tab === 'wall'`) and
`EditWallDialog`'s mount happened in the same render, so `currentDocument` was always `undefined`
at initializer time.

**How to apply:** When reviewing/writing a dialog-like child fed by a parent's async query data,
check whether the child can mount before that data arrives. If so, don't trust a bare `useState`
initializer — add an effect that re-syncs on the open-transition and/or on the prop's arrival
(track with a ref so it only syncs once per open, not on every unrelated re-render). This is a
generally reproducible React/TanStack Query pattern, not project-specific — watch for it anywhere
a modal/panel is conditionally added to the tree alongside the query that feeds it.
