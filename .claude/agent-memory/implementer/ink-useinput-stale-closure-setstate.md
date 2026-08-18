---
name: ink-useinput-stale-closure-setstate
description: Ink useInput handlers (text editing, but also list/picker index or mode navigation) must compute the next value inside the setState updater (from `current`), never from the outer render's closured state — several keys fired in one JS tick (no re-render between them) otherwise silently overwrite each other
metadata:
  type: feedback
---

Found while building `apps/tui/src/screens/EditProfileScreen.tsx` (A-027): a backspace
handler written as `setFields(current => ({ ...current, [key]: fields[key].slice(0, -1) }))`
— note `fields[key]` (the outer closure) instead of `current[key]` — computes the _value_ to
write from the stale render, even though the merge itself uses a functional updater. Multiple
`stdin.write()` calls issued back-to-back with no `await` between them (e.g. a test loop
`for (...) press(KEY.backspace)`) all fire their input handlers against the _same_ pre-update
render before React flushes any state change, so every call computes from the same starting
string. Result: 3 backspace presses on `"Ann"` didn't produce `""`, they each independently
computed `"An"` and the last write wins — net effect, _zero_ deletions.

**Why it matters:** This isn't just a test artifact — `ComposeScreen.tsx`'s existing
`onChange({ ...draft, body: draft.body.slice(0, -1) })` has the identical shape (value read
from the closured prop, not a functional form), it just hasn't been caught because rapid
same-tick keystrokes are rare in real terminal input and `ComposeScreen`'s state is lifted to
`App` anyway. Any new Ink screen doing local per-keystroke text editing is at risk the moment
a test (or a paste, or fast typing under load) delivers several `useInput` calls before a
re-render lands.

**How to apply:** Any `useInput` handler that mutates a string field via local `useState`
should route through a helper like `updateField(key, next: (current: string) => string)` that
calls `setFields(current => ({ ...current, [key]: next(current[key]) }))` — never precompute
the new value from the outer render's variable. When writing a harness test that fires several
raw keys, prefer one `press()` call with the full multi-char string over a loop of single-key
`press()` calls (Ink already special-cases multi-char input as one event — see the
`ComposeScreen.tsx` JSDoc); reserve looped single-key presses for cases (like exercising
backspage) where the component itself must already be closure-safe.

**2026-08-18 update — this isn't just text fields.** Re-hit while building
`apps/tui/src/screens/PageBlocksEditorScreen.tsx` (B-023): the `a` type picker's `j`/`k`
navigation was `setMode({ mode: 'addPicker', typeIndex: mode.typeIndex + 1 })` — same bug,
different state shape. A test loop pressing `j` five times landed on index 1, not 5. The fix
is identical: `setMode((current) => current.mode === 'addPicker' ? { ...: Math.min(current
.typeIndex + 1, max) } : current)`. Rule of thumb: any `useInput` handler that derives its
next `useState` value from a number/index/enum/mode already held in that same state (not just
a string) needs the functional form, full stop — confirmed via Ink 7's `use-input.js` source
that the _handler itself_ is always fresh (`useEffectEvent`), so staleness is purely a React
batching issue on the state value, not an Ink registration-lag issue (that's a different,
unrelated hazard — see `ink-flush-to-poll-conversion-hazards`).
