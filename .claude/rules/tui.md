---
paths:
  - 'apps/tui/**'
  - 'packages/terminal-media/**'
---

# TUI rules (Ink 7)

- **ESM only** — `apps/tui` has `"type": "module"`; Ink 7 is ESM-only, don't fight it with CJS interop hacks.
- **No network calls during render.** gRPC calls happen in hooks/an API layer (custom hooks wrapping the generated client), never inline in a component body — components stay pure render functions over state.
- **Keyboard-first.** Every interactive affordance needs a keybinding; consult the keybindings table (`docs/architecture/tui.md`) before inventing a new one — don't collide with an existing binding.
- **Minimum terminal size**: handle gracefully (message, not a crash/garbled layout) below the documented minimum (spec §72).
- **Images always need a non-Kitty fallback** (spec §75, §153) — never render a feature that only works under Kitty with no fallback path; test both paths.
- **Kitty hazards** (`docs/research/ink-kitty-graphics.md`):
  - Never `wrap="truncate"` on a placeholder row — it appends `…` and corrupts the unicode-placeholder grid.
  - Never `<Text color>` wrapping a placeholder row — color codes interleave with placeholder codepoints and break the protocol.
  - Transmit Kitty APC image sequences via `process.stdout.write` directly, **not** through Ink's own text tree — APC sequences placed inside `<Text>` get stripped by Ink's reconciler.
  - Clear images explicitly on exit/scroll-away; don't rely on terminal state resetting itself.
- **No `console.log`/`console.error`** anywhere in the render path — it corrupts the alternate-screen UI. Route diagnostics to a file logger or a dedicated debug pane.
- **Clean exit**: always restore terminal state (cursor visibility, alternate screen, Kitty image clear) on every exit path, including signals and uncaught errors — not just the happy path.
- **Never lose a compose draft** — persist to local state/disk before any risky operation (submit, navigate away); spec §80 requires drafts to survive.
- **Errors render as human-readable messages**, never a raw stack trace or gRPC status string, in the TUI itself.
