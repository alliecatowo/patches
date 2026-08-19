---
name: vhs-headless-tui-demo-recording
description: How to record real Ink TUI sessions headlessly with VHS+ttyd, and hazards specific to this repo's mise/XDG setup
metadata:
  type: project
---

VHS 0.11.0 + ttyd render headlessly fine against `google-chrome` (no Xvfb needed) — confirmed
working in this sandbox for [[patches TUI demo recording]] (P9-002, `infra/demos/`).

Gotchas found the hard way:

- **`Output`/`Screenshot` paths are relative to the `vhs` process's cwd**, not the tape
  file's location. `Set`/`Output` lines must come before any action line or VHS silently
  ignores them with a "move to top of file" warning; `Output` itself must be the first
  non-comment line.
- **`Screenshot foo.png` needs a `Sleep` _after_ it** in the same tape or the file never
  gets flushed to disk (no error, it just silently doesn't exist).
- **`Env KEY value` and ambient env vars both propagate** into the ttyd-spawned shell — you
  don't need `Env` at all if the env var is already exported on the process that invokes
  `vhs`.
- **Never combine `mise exec --` with an XDG_CONFIG_HOME/XDG_DATA_HOME override on the same
  command.** `mise exec` itself (not just the child process) resolves its own data dir from
  XDG_DATA_HOME, so `XDG_DATA_HOME=some/session/dir mise exec -- vhs ...` makes mise
  reinstall the _entire_ pinned toolchain (buf, pnpm, node, vhs, ttyd, ...) into that
  directory — ~587MB into what should've been a small per-account credential dir. Resolve
  the binary path once with plain `mise which <tool>` (no override), then invoke that
  absolute path directly with the XDG override.
- **VHS pixel `Width`/`Height` → terminal columns/rows**: at `FontSize 16`, `1260x896`
  yields ~111x34 columns/rows (close enough to any "100x30ish" ask) — there's no direct
  columns/rows setting, only pixel dimensions plus font size.
- Ink key-combo prefixes (e.g. this app's `g` + `h`/`n`/`l`/...) work fine via a single
  `Type "gh"` — VHS's per-character typing delay (default/`TypingSpeed` ~50-60ms) is well
  inside a typical 600ms combo timeout window.

See also [[patches-tui-demo-recording-content-hazards]] for the "don't re-run a tape that
posts/follows for real" lesson.
