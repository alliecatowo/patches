---
name: tui-fake-api-parity-required
description: apps/tui/test/fake-api.ts must implement every PatchesApi method a component calls, even ones "not needed by the tests" — a missing method throws synchronously and blanks the whole render (see ink-swallowed-render-error-blank-frame)
metadata:
  type: feedback
---

`apps/tui/test/fake-api.ts`'s `FakeApiHandle.api` object is a hand-maintained structural stand-in
for `PatchesApi` — it is not generated from the interface, so TypeScript won't catch a missing
method by itself (the object literal is only checked where it's actually assigned/used, and in
practice everything routes through the same broad `PatchesApi` type so a gap doesn't surface at
`tsc` time the way a truly-typed mock would).

**Why this matters more than a normal missing-mock gap:** a component calling a method that
doesn't exist on the fake throws synchronously inside whatever render/effect called it, and Ink 7's
reconciler silently swallows that (see [ink-swallowed-render-error-blank-frame](ink-swallowed-render-error-blank-frame.md))
— no error output anywhere, just every downstream test timing out on a blank frame. This has now
bitten twice in one session on two different methods (`getAuthPolicy`, `getNodePolicy`) added by
two different concurrent agents to `App.tsx`/`LoginScreen.tsx` without a matching fake stub.

**How to apply:** the moment you add a call to a new `PatchesApi` method anywhere reachable from
`App.tsx` (a top-level effect, a screen mounted by default, anything not gated behind a rare user
action), grep `apps/tui/test/fake-api.ts` for that method name first. If it's missing, add it in
the _same_ commit — the existing convention for "the tests don't actually exercise this" is
`methodName: () => Promise.reject(grpcError(GrpcStatus.UNIMPLEMENTED, 'fake api: not needed by the
tests'))`, which callers with a `.catch()`/rejection handler already tolerate gracefully. Don't
assume "someone else already added it" — verify with a live grep, since this is a shared,
concurrently-edited file and a duplicate stub silently loses to whichever write lands last (see
[shared-checkout-file-lands-in-other-agent-commit](shared-checkout-file-lands-in-other-agent-commit.md)).
