---
name: ink-frame-assertions-host-color-dependent
description: Ink test frames carry SGR only when the host has colour (FORCE_COLOR), so raw frame assertions pass locally and fail in CI (or vice versa)
metadata:
  type: project
---

Any assertion over a raw `ink-testing-library` frame is host-dependent until proven
otherwise. Chalk (inside Ink) reads colour support from the **host** environment, so a shell
exporting `FORCE_COLOR` produces frames full of SGR sequences while CI produces none.

**Why:** cost a long debugging detour in the Phase 12 TUI wave — nine tests "failed" that were
fine, and the failures looked like real regressions in unrelated screens. Two distinct
breakages: (1) `expect(frame).toContain('some phrase')` fails when colour codes sit inside the
phrase; (2) a themed phrase spans several `<Text>` nodes, so `waitForFrame(lastFrame, 'Enter
run · Tab complete')` times out on a frame that visibly shows those words.

**How to apply:** `apps/tui/vitest.config.ts` pins `env: { FORCE_COLOR: '3' }` and
`apps/tui/test/ansi.ts` provides `stripSgr` / `hasNonSgrEscape`; the shared `waitForFrame` in
`test/harness.tsx` already strips. When writing a new frame assertion, match on stripped text.
For "no escape sequences smuggled in" tests use `hasNonSgrEscape`, not "contains no ESC" —
the theme's own colour trips the latter. Related: [[ink-testing-library-row-overflow]].
