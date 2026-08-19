# 0018. TUI interaction model: measured frame, screen stack, composited overlays

**Status:** Accepted
**Date:** 2026-08-18

## Context

The live TUI corrupted its own frame after heavy use — rows overlapping, bodies cut, the status bar
wrapping to two lines. The cause is structural: nothing bounded frame height or line width, and
`PostList` _estimated_ row height ("roughly three lines") instead of measuring it. Ink reconciles
frames line by line, so a frame taller than the window, or a line wider than `columns`, permanently
desynchronises its cursor arithmetic and every later repaint smears.

Around that sat interaction problems with one shared root — no single owner for navigation, keys or
focus: `Esc` unreliable, screens that disabled the global keymap and trapped the user, hints drifting
from help, leaked Kitty placements, no cursor in the compose editor, and no split/overlay/drawer
layout at all. Separately, §191 assigns keys that collide with three existing bindings while §194
forbids rebinding a documented key, so the collisions need deciding once rather than per-PR.

Full design: `docs/architecture/tui-interaction-model.md`.

## Decision

1. **A measured frame budget is the foundation.** Ink's alternate screen (`alternateScreen: true`,
   never hand-rolled). `app/layout.tsx` computes one budget (`contentRows = rows - FOOTER_ROWS`) and
   publishes it via context; `useWindowSize()` is called exactly once, in the shell. The content
   region is the only scrolling region, has an explicit height and `overflow="hidden"`, and is
   **virtualized on measured item heights** (`format/measure.ts`, `components/list-viewport.ts`,
   `components/post-height.ts`). Every measured component carries a `renderToString` test proving
   measurement equals rendered line count. `App` takes a test-only `size` prop, because
   `ink-testing-library@4`'s fake stdout hard-codes `columns = 100` and exposes no `rows`.

2. **One typed navigation stack; `Esc` pops the innermost layer** (modal → sub-mode → screen). A
   screen never disables the shell's `useInput`; it registers a key layer that _consumes_ keys, so
   `Esc`, `Ctrl+C` and the palette are reachable from every state. Presentation is derived from that
   same stack: at ≥ 120 columns a `detail` route renders in a right split pane over the `list` route
   beneath it; narrower terminals render the identical stack as full-screen screens. No separate
   split-view state exists.

3. **Overlays are composited, not faked.** Ink has no z-index. A floating overlay snapshots the
   background once with `renderToString(node, {columns})`, pads every line to the content width,
   dims it, and splices the overlay in with ANSI-aware `slice-ansi`. Verified by direct probe against
   `ink@7.1.1` + `slice-ansi@9` on 2026-08-18: SGR survives the round trip through `<Text>`, line
   count is preserved, and un-padded background lines are what cause width drift. Below 80 columns
   or 30 rows, overlays degrade to replacing the content region.

4. **`app/keymap.ts` is the single source of truth** for the status hints, the `?` help screen and
   the command palette. Its §191 collisions resolve as: `R` becomes repost and **refresh moves to
   `Ctrl+R`**; `Q` becomes quote and `Q`-as-quit is removed; and **`j` stays "next item" with
   community join/leave bound to `J`** — rebinding the app's most-used movement key would break
   every list and would itself violate §191's own no-rebind sentence and §194.

5. **Inline Kitty images render in three places only**: the selected row of a list, a thread's
   focused post, and a dedicated media viewer. Everywhere else renders the §75 fallback box at an
   **identical measured height**, so measurement is protocol-independent and the layout never
   reflows when graphics support changes. The renderer keeps an LRU of ≤ 4 live placements, freeing
   evictions with `d=I`; placements are released before an overlay snapshot.

6. **No mouse support in v0.** SGR mouse reporting needs a raw `stdin` listener racing Ink's key
   parser, breaks native text selection, and buys nothing where §69 already requires a key for every
   affordance. Revisit only if Ink ships a supported mouse channel.

## Consequences

- Frame corruption becomes a test failure, not a field report: an invariant test asserts line count
  ≤ rows and cell width ≤ columns for _every_ emitted frame, on every screen, at four sizes, with a
  1000-post feed.
- Every new list, screen and body renderer must ship a measurement function alongside it. That is a
  real ongoing cost and the price of the guarantee — and why the markdown grammar is kept small.
- Split panes, drawers and overlays become cheap because they are presentations of one stack and one
  budget — but each is tier-gated, so every one needs a documented narrow-terminal fallback (`N` →
  `g n`, overlay → region replacement, split → the stack).
- `R` and `Q` change meaning for existing users; both must land with the user guide, the `?` help
  screen and the release notes in the same commit.
- **`J` for community join/leave deviates from §191's literal text and needs owner confirmation.**
  Nothing else here departs from the spec; no §153/§177/§194 prohibition is touched.

## Alternatives considered

- **Estimated row heights with a safety margin** (today's approach). Rejected: any under-estimate
  reintroduces the corruption, and wide glyphs plus wrapped bodies guarantee under-estimates.
- **A separate split-view mode with its own state.** Rejected: two sources of "where am I" is how
  `Esc` broke the first time.
- **Overlays by region replacement only.** Zero-risk, and it stays the narrow-tier fallback.
  Rejected as the general case: the probe showed real compositing works, and a frozen background
  costs _fewer_ repaints than a live one.
- **Inline images in every visible row.** Rejected: unbounded placement churn is the likeliest cause
  of "images stopped rendering", and it makes row height protocol-dependent.
- **Keeping `R` as refresh and inventing a new repost key.** Rejected: §191 is explicit, `R` is
  absent from the documented user-guide key table, and refresh is the newer binding.
