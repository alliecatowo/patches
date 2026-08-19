---
name: ink-fresh-mount-useinput-subscription-race
description: A component's useInput only subscribes on a later passive-effect tick after mount, not synchronously with the commit that renders it — a keypress that lands in that gap is silently dropped forever, not delayed
metadata:
  type: project
---

Ink's `useInput` (`hooks/use-input.js`) subscribes to the internal input event
emitter inside a plain `useEffect`, not `useLayoutEffect`. When a list-owning
component (e.g. `VirtualList`) mounts for the first time exactly when async data
arrives (a search resolves, a page loads), there is a real window — small but
not always covered by a fixed test `flush()` — where the component has rendered
(so `lastFrame()` already shows the new content) but its `useInput` has not yet
registered. A keypress sent via `ink-testing-library`'s `stdin.write()` in that
window is a synchronous `EventEmitter.emit`, so it is delivered to whichever
listeners are _currently_ attached and then gone — a subsequent `waitForFrame`
poll will never see its effect, because the event already fired into nobody.

Symptom: a component test that does two `press()`/`stdin.write()` calls back to
back around an async boundary (search → open result) intermittently or
deterministically drops the second keypress, and `waitForFrame` times out at
its full budget rather than resolving late — proof the event was lost, not
delayed.

**Fixes, in order of preference:**

1. Keep the list component mounted continuously across the async transition
   (e.g. render it with an empty-items state before results exist) so its
   subscription is already live long before the time-sensitive keypress,
   rather than a fresh mount racing that keypress. Used in `SearchScreen`'s
   actor `VirtualList` (P12-004 commit history).
2. If a fresh mount can't be avoided, add a short `await flush(30)` after the
   mount-triggering action in the _test_, as `test/shell-layout.test.tsx`
   already does around `renderAppInWindow` + `Enter` opening a thread.

Don't reach for a longer fixed `flush()` everywhere as a blanket fix — it's a
symptom-level patch on the test, and (1) is almost always available and fixes
the underlying race rather than papering over it.
