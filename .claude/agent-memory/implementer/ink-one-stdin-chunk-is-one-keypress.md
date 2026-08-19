---
name: ink-one-stdin-chunk-is-one-keypress
description: Ink's useInput parses a whole stdin chunk into ONE keypress, so fast-typed multi-key sequences arrive as a single multi-char input and silently break
metadata:
  type: project
---

Ink's `useInput` calls `parseKeypress(data)` **once per stdin data event**. Two keys typed
faster than the terminal flushes arrive in one read and reach the handler as a single
`input: 'gh'` — a two-key sequence like the `g` navigation prefix is never seen.

**Why:** shipped broken in the Phase 12 TUI wave. It survived the entire unit suite because
`press('g')` then `press('h')` are two separate writes; it only appeared driving the real
binary under tmux. The failure mode is nasty — the faster the user types, the less works.

**How to apply:** the shell splits coalesced printable runs via `isCoalescedKeyRun`
(`apps/tui/src/app/input.tsx`) and replays them one key at a time. Any new multi-key sequence
must go through that path. Related: multi-key prefix state must live in a **ref**, not
`useState`, because the same handler closure serves every key in a chunk — see
[[ink-useinput-stale-closure-setstate]]. To reproduce, write both keys in one call:
`press('gh')`, or `tmux send-keys -t qa 'gh'`.

Also from that wave: hide an overlay's background with `display="none"`, never `height={0}` —
a zero-height box leaves layout but Ink still paints its text into the overlay's rows.
