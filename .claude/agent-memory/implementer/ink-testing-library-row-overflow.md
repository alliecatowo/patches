---
name: ink-testing-library-row-overflow
description: Ink's App.tsx <Box height={rows}> viewport can overlap/garble lines when content exceeds the terminal's row count in ink-testing-library snapshot tests — test renderer subtrees directly for content-heavy screens instead
metadata:
  type: feedback
---

`apps/tui/src/app/App.tsx` wraps every screen in a `<Box height={rows}>` sized to the
real (or `ink-testing-library`'s default, small) terminal. When a screen's rendered
content exceeds that row budget (e.g. a `PageScreen` with a dozen-plus blocks), Yoga's
layout can hand two different lines' text to the same terminal row coordinate — one
line's content silently vanishes or gets spliced into the neighboring line (e.g. a
`Hero` block's title disappearing, or `bold` merging into an adjacent list item as
`oned`). This is not a bug in the leaf components — an isolated
`render(<PageBlocksView ... />)` with no fixed-height ancestor renders the exact same
JSX correctly.

**Why:** Spent significant time debugging a "missing text" failure in a full-`App`
harness test before realizing it only reproduced with >~10 blocks worth of content and
never through a direct component render. Binary-searched block count to isolate it.

**How to apply:** For any new screen whose content can legitimately be long (feeds are
fine — they paginate to a bounded page size — but a Page, a long thread, etc. are not),
write two kinds of tests: (1) a direct `render()` of the content-rendering
component/subtree (no `App`, no fixed-height wrapper) for full content-shape coverage,
and (2) a small, App-level `renderApp()` test with a handful of items only, for
interaction/navigation. Don't put comprehensive content-type coverage inside a full-`App`
harness test — pattern used in `apps/tui/src/pages/render/blocks.test.tsx` (content
coverage) vs `apps/tui/test/pages.test.tsx` (navigation, kept to 1-2 blocks per
document). This is a candidate for an actual harness fix (e.g. `renderApp` accepting a
larger `stdout` size) — filed as a follow-up, not fixed in this session.
