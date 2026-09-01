# Issue #181 — TUI Now ring and screen/drawer UI

## Status

Blocked on P12-120, which is still Todo and itself blocked on P12-119.

## Plan

1. [x] Verify the live issue state, workpad, linked PRs, and dependency.
2. [x] Reproduce the current repository signal and inspect existing TUI screen/drawer seams.
3. [ ] Implement only once P12-120 provides the protocol contract; do not invent a client API.
4. [ ] Validate with focused TUI tests and the scoped workspace check after implementation.

## Acceptance criteria

- The ring is absent when there is no followed Now status and renders at most one home row.
- The ring/screen/drawer use followed actors only and support loading, empty, error, and expiry states.
- `:now` and the documented navigation path work in rich and plain modes.
- The implementation consumes P12-120's generated protocol and preserves chronological, non-ranked behavior.

## Current blocker evidence

- Issue body says `BLOCKED on P12-120`.
- `docs/product/tui-design-vision.md` maps P12-121 (the TUI slice) to `apps/tui/src/components/NowRing.tsx` and `screens/NowScreen.tsx`, blocked on P12-120.
- `rg -n 'Now|drawer|screen|ring' apps/tui packages/proto` finds no Now protocol or TUI implementation.
- GitHub GraphQL project read: P12-121 (#181) remains `Todo`, with `Blocked by` = `P12-120`; P12-120 (#180) remains `Todo`, with `Blocked by` = `P12-119`.
- Workspace HEAD is `a21a7df`; only the required issue artifacts are untracked. No application files changed.
