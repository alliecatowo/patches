---
name: ink-rapid-stdin-write-needs-flush
description: Multiple synchronous stdin.write() calls in a test (multi-field forms, Tab-then-type sequences) silently use stale state unless awaited between them
metadata:
  type: feedback
---

Several sequential `stdin.write()` calls fired back-to-back with no `await` between
them (e.g. driving a multi-field inline form: type name, `\t`, type value, `\t`,
submit) can have later keys act on stale component state — the assertion on the
final call (e.g. `expect(createFn).toHaveBeenCalledWith(...)`) fails with "0 calls"
even though the handler logic is correct.

**Why:** each `stdin.write()` triggers Ink's synchronous stdin data handler, but the
resulting `setState` update doesn't necessarily flush to a new render (and a fresh
`useInput`/`useKeyLayer` closure) before the next `write()` call fires if there's no
tick in between. This bit `FiltersScreen.test.tsx` and `AppealsScreen.test.tsx`
(P14-016/017) — both direct-render component tests (`render()` from
`ink-testing-library`, not `renderApp()`/`test/harness.tsx`'s `press()` helper).

**How to apply:** when a test drives more than one keystroke/chunk in sequence
against a component with per-keystroke state transitions (field focus, cursor,
multi-step forms), insert a small `await new Promise((resolve) => setTimeout(resolve,
20))` between `stdin.write()` calls, or better, `await vi.waitFor(...)` on an
observable frame change between steps. A single `stdin.write('some text')` for one
burst of printable characters is fine (Ink parses one chunk into one keypress
anyway — see [[ink-one-stdin-chunk-is-one-keypress]]); the hazard is specifically
several _separate_ `write()` calls with no yield between them.
