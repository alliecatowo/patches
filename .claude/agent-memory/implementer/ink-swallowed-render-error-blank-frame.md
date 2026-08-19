---
name: ink-swallowed-render-error-blank-frame
description: Ink 7's reconciler registers no-op onUncaughtError/onCaughtError/onRecoverableError, so a thrown render/effect error produces zero console output — only a mysteriously blank "\n" frame on the next Ink-internal unmount write
metadata:
  type: feedback
---

Ink 7's `Ink` class calls `reconciler.createContainer(..., () => {}, () => {}, () => {}, () => {})`
— all four React 19 root error callbacks (`onUncaughtError`, `onCaughtError`, `onRecoverableError`,
and the legacy hydration one) are no-ops. A component that throws during render or a passive effect
(e.g. calling a method the test's fake API object doesn't implement, so `api.someMethod()` throws
`TypeError: ... is not a function` synchronously before `.then()`/`.catch()` are even reached) is
caught by React's internal error boundary machinery and silently unmounts the tree — **no
`console.error`, no `uncaughtException`, no `unhandledRejection`**, nothing observable from outside.

The only visible symptom: `ink-testing-library`/hand-rolled `TestStdout.lastFrame()` starts
returning `"\n"` (a single blank line) from that point on and never recovers, because
`this.options.stdout.write(this.options.debug ? '\n' : this.lastOutput + '\n')` is what Ink's
unmount-teardown path writes for a non-interactive stream. Every `waitForFrame`/`expectFrame`-based
test then times out waiting for text that will never appear — under `vi.useFakeTimers({toFake:
['Date']})` this shows as the _outer_ vitest test timeout (`Date.now()` never advances, so the
polling loop's own deadline check never fires), not the helper's own "timed out after Nms" message;
without fake timers it shows the helper's own message with an empty "Last frame" — same root cause,
different surface.

**How to diagnose:** don't trust `lastFrame()` output or grep test stdout for errors — there won't
be any. Write a throwaway render using the _real_ EventEmitter-based `TestStdout`/`TestStdin` (copy
`apps/tui/test/window.tsx`'s private classes; `ink-testing-library`'s own stdout stub lacks
`isTTY`/`.on()` needed for some paths) wrapped in a plain React `class Boundary extends Component`
with `componentDidCatch(error, info)` logging — that's the only way to see the actual thrown error
and its component stack.

**Why:** found chasing a "login flow hangs" report — root cause was a new `useEffect` calling
`api.getNodePolicy()`, which the shared `apps/tui/test/fake-api.ts` fake didn't implement yet
(another agent hadn't added it). Every `loginAs()`-based test in the whole suite failed, including
already-committed golden frames, purely because of this fake being one method behind the real
`PatchesApi` — see [tui-fake-api-parity-required](tui-fake-api-parity-required.md).

**How to apply:** whenever App.tsx (or any component under Ink) gains a call to a new `PatchesApi`
method, add a matching stub to `apps/tui/test/fake-api.ts` (`Promise.reject(grpcError(GrpcStatus
.UNIMPLEMENTED, ...))` is the existing convention for "not needed by the tests") in the _same_
change — a missing stub doesn't fail loudly, it blanks the whole render tree for every test that
happens to reach that code path.
