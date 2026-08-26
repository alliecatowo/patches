# `shake.js` — evaluated for B-163, not adopted

Checked 2026-08-25 against B-163 ("replace `useShakeToReport` with `shake.js`").

## Facts, with sources

- **npm package**: `shake.js`, latest published version `1.2.2`. Registry metadata
  (`https://registry.npmjs.org/shake.js`, fetched 2026-08-25) shows only two ever-published
  versions, `1.2.1` and `1.2.2`, both from **2015-07-22**. No release since.
- **GitHub repo**: `alexgibson/shake.js`. GitHub API (`api.github.com/repos/alexgibson/shake.js`,
  fetched 2026-08-25) reports `"archived": true` and `"pushed_at": "2018-10-17T09:29:49Z"` — the
  repo is read-only (no new PRs/fixes can land) and its last real commit predates iOS 13
  (released September 2019) by nearly a year.
- **TypeScript support**: none. The package ships no `.d.ts` and there is no `@types/shake.js`
  on npm (`registry.npmjs.org/@types/shake.js` → 404, fetched 2026-08-25). A consumer needs a
  hand-written ambient declaration.
- **Source, iOS 13+ permission handling**: fetched `unpkg.com/shake.js@1.2.2/shake.js`
  (2026-08-25) and read it in full. `Shake.prototype.start` unconditionally calls
  `window.addEventListener('devicemotion', this, false)` when `'ondevicemotion' in window` is
  true. There is **no call to `DeviceMotionEvent.requestPermission()` anywhere in the source**,
  and no hook/option to run one before `start()`. On iOS 13+ Safari/PWA, motion events are
  gesture-gated: without an explicit, user-gesture-triggered `requestPermission()` call that
  resolves `'granted'`, `devicemotion` never fires — no error, just silence.
- **Confirmed by the maintainer**: GitHub issue
  [`alexgibson/shake.js#52`, "Safari iOS event not firing"](https://github.com/alexgibson/shake.js/issues/52)
  (closed) is exactly this gap. The maintainer's own reply points the reporter at Apple's iOS 13
  release notes and a third-party "how to call `requestPermission`" writeup — i.e. the library
  never gained permission handling; callers are expected to bolt it on separately, entirely
  outside `shake.js`.

## Decision: do not swap

`shake.js` would replace our ~25-line, unit-tested threshold-detection hook
(`apps/web/src/hooks/useShakeToReport.ts`) with an archived, untyped, decade-old dependency that
**does not solve the one thing that actually matters on the platform this bug was reported on**:
the iOS 13+ gesture-gated permission flow. Swapping buys nothing — the permission-request code
would still have to be hand-written by us, wrapped around `shake.js`'s `start()`, which is no
simpler than the in-repo threshold math it would replace. It also adds an archived dependency (no
path to a future fix) and ships no types.

If this is revisited, the bar is a library that (a) is maintained/typed and (b) actually owns the
`requestPermission()` gesture flow — `shake.js` is neither.

## A separate, real gap found during this evaluation

`useShakeToReport` (wired in `apps/web/src/routes/RootLayout.tsx`) never calls
`DeviceMotionEvent.requestPermission()` at all — there is no user-gesture entry point anywhere in
the app that would trigger it. This means shake-to-report is presently a silent no-op on real iOS
Safari/PWA regardless of which detection library is used underneath. This is orthogonal to the
library-swap question and is filed as `B-181` rather than folded into this decision.

**Not verified here**: on-device iOS behavior. Everything above is registry/API/source-level
research; nothing in this note claims to have been tested on a physical iOS device.

## B-181 fix landed (2026-08-25)

`useShakeToReport.ts` now feature-detects the iOS-only static `DeviceMotionEvent.requestPermission`
(a narrow local TS interface, not `any` — the DOM lib ships no ambient type for this non-standard
Apple extension) and only attaches the `devicemotion` listener once a persisted permission is
`granted`. The gesture itself is requested from `AppearanceSettingsRoute.tsx`'s new "Shake to
report" section, whose button calls `requestShakeToReportPermission()` synchronously from
`onClick` — the one place in the app that is unambiguously a real user gesture. Denial (or Safari
throwing because the call happened outside a gesture) is treated as `'denied'` and shown honestly,
with a link to `/report`, rather than leaving a dead control. See
`docs/operations/issue-reporter.md`'s "Web: shake-to-report and its iOS opt-in" section for the
full behavior. **Still not verified on a physical iOS device** — coverage here is jsdom unit tests
stubbing `DeviceMotionEvent.requestPermission`, not on-device Safari testing.
