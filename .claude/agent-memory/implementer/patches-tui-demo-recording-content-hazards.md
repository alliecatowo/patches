---
name: patches-tui-demo-recording-content-hazards
description: Recording TUI demo tapes against the live prod node creates real, non-idempotent content — plan tape ordering and re-runs accordingly
metadata:
  type: feedback
---

When a VHS/tmux-driven tape drives the real `patches` client against the live flagship node
(`patches-social.fly.dev`) signed in as a real account, every action it performs is a real
write, not a fixture. Learned while recording [[vhs-headless-tui-demo-recording]] (P9-002):

- Re-running a "compose a post" tape to fix an unrelated bug (e.g. output filenames) posts
  the same demo text _again_ — there is no delete-post affordance in the TUI (the
  `DeletePost` RPC exists server-side but isn't wired to any keybinding), so cleanup means
  either living with the duplicate or writing a script against `SessionManager`/
  `PatchesApi.deletePost` — which the environment's auto-mode classifier blocks outright as
  soon as it sees credential-store/session-token code being written, even read-only-looking
  helper scripts. Don't try to route around that block; surface the duplicate content to the
  user instead of guessing at a workaround.
- A "follow/unfollow toggle" tape (e.g. search → open profile → press `f`) is state-dependent:
  if the account already followed the target from a previous re-run, the same tape now
  _unfollows_ instead, silently inverting the demo's narrative. Before the "real" recording
  pass, drive the account once via `tmux new-session -d -x <cols> -y <rows> "<cmd>"` +
  `send-keys` + `capture-pane -p` (see `.claude/rules/tui.md`'s non-TTY verification pattern)
  to confirm/fix starting relationship state, _then_ run the tape.
- **Practical rule: order and pre-verify tapes so no tape needs to run twice.** Idempotent
  tapes (pure reads/screenshots) are safe to re-run freely; anything that mutates
  (compose/reply/follow) should be recorded once, verified via frame-extraction
  (`ffmpeg -ss <t> -i out.gif -frames:v 1 check.png`, one ffmpeg invocation per Bash call —
  chaining two ffmpeg commands, or using a `select=eq(n,N)` filter expression, tripped this
  environment's command classifier; plain `-ss` seeking didn't), and left alone.
