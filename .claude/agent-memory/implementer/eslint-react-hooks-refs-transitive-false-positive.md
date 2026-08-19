---
name: eslint-react-hooks-refs-transitive-false-positive
description: eslint-plugin-react-hooks's react-hooks/refs rule flags a same-render function call if ANY closure reachable in its argument graph touches a ref's .current anywhere in its body, even if never actually invoked during render
metadata:
  type: feedback
---

The (new, React-Compiler-era) `react-hooks/refs` lint rule does real but shallow dataflow tracing:
if you call `someFn(objectContainingCallbacks)` during render, and one of those callbacks —
however many function-reference hops away — has a body that writes/reads a ref's `.current`
(e.g. `navigate()` doing `navigated.current = true`), the rule flags the _outer call site_ with
"Passing a ref to a function may read its value during render", even when:

- the callback is never actually invoked synchronously by the called function (it's only wrapped
  via `bind()`/stored for a later event handler), and
- the outer function returns early before ever touching the callback (e.g. `if (post ===
undefined) return [];`).

Renaming/wrapping the callback in an inline arrow (`onOpenActor: (h) => openActorByHandle(h)`)
does **not** help — the rule still traces into the arrow's body and finds the ref write inside
`navigate()`.

**Why:** confirmed via bisection (removing fields from the argument object one at a time) while
wiring `contextualCommands(selection)` in `App.tsx` — `selection.onOpenActor` closes over
`openActorByHandle` → `openProfile` → `navigate()` → `navigated.current = true`. The call itself
(`contextualCommands(contextualSelection)`) genuinely never reads the ref during render (verified:
`contextualCommands`'s `post === undefined` early-return means nothing downstream even runs yet),
so this is a true false positive, not a masked real bug.

**How to apply:** when this fires and you've actually verified (by reading the callee, not just
assuming) that the flagged call never synchronously invokes the ref-touching closure during render,
a scoped `// eslint-disable-next-line react-hooks/refs` immediately above the flagged statement
(with a comment naming the actual ref chain, e.g. "`navigated.current` via `navigate()`, reached
only from `onInvoke`, an event handler") is the correct fix — not restructuring working ref-based
navigation code, and not omitting the feature. Put the justification comment on lines _before_ the
disable directive, since `eslint-disable-next-line` only covers the literal next line, not the next
non-comment line.
