---
name: react-hooks-purity-strict-lint
description: apps/tui's eslint enforces react-hooks/refs and react-hooks/purity (React Compiler rules) — no ref read/write and no impure calls (Date.now()) during render, even memoized via a ref-comparison pattern
metadata:
  type: feedback
---

apps/tui's eslint config enables `react-hooks/refs` and `react-hooks/purity` (the newer
React Compiler-derived rules), which are stricter than plain `react-hooks/exhaustive-deps` and
`react-hooks/set-state-in-effect`:

- **Never read or write `ref.current` during render**, even for a "lazy memoization" pattern
  (`if (ref.current === undefined || ref.current.key !== x) { ref.current = compute() }`) that
  is otherwise a legitimate, commonly-recommended React pattern elsewhere. This project's lint
  flags it anyway. Refs may only be touched inside effects, event handlers, or other callbacks
  (including a promise `.then()`/`.catch()` — that still counts as "not render").
- **`Date.now()` (or any impure call) during render is also flagged** ("Cannot call impure
  function during render"), independent of the ref rule — so a value like an epoch timestamp
  can't be derived synchronously in the component body even via a pure-looking `useMemo`-style
  ref check.
- **The fix**: compute derived, time-dependent state (e.g. `retryAt` for a countdown) _inside
  the same effect/promise-callback that already legitimately calls `setState`_ — mirror
  whatever pattern the file already uses to avoid `react-hooks/set-state-in-effect` (e.g. a
  fetch effect's `.then()/.catch()` already sets one piece of state asynchronously; add the new
  piece of state to that same callback rather than a second effect that sets it synchronously
  in its own body). A second effect is fine for _scheduling a timer_ off the now-known value
  (`useEffect(() => { if (x === undefined) return; const t = setTimeout(...); return () =>
clearTimeout(t); }, [x])`) as long as it only calls `setState` from inside the timer's own
  callback, never synchronously in the effect body.

**Why**: found implementing `useServerInfo`'s auto-retry countdown (P12-011/tui-ux-and-web-client
branch) — a ref-memoized `retryAt` derivation passed typecheck and tests but failed
`pnpm exec eslint` with a dozen `react-hooks/refs`/`react-hooks/purity` errors pointing at every
read of the ref and the `Date.now()` call.

**How to apply**: before reaching for a ref to memoize a derived value during render in this
codebase, check whether the value can instead be set from inside an existing effect's
async callback. Run `pnpm exec eslint` on the file early, not just `tsc`+`vitest` — these rules
don't affect types or runtime test behavior at all, only lint, so they're easy to miss until the
final lint pass.
