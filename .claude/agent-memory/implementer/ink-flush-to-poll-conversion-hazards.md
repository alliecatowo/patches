---
name: ink-flush-to-poll-conversion-hazards
description: Converting apps/tui's fixed flush() test sleeps to condition-based waitForFrame/expectFrame polling trades one flake for two subtler, deterministic ones
metadata:
  type: feedback
---

When converting Ink `ink-testing-library` tests from a fixed `flush(ms)` sleep to a polling
`waitForFrame(lastFrame, predicate)`/`expectFrame(lastFrame, text)` (apps/tui/test/harness.tsx),
watch for two failure modes that look like "my conversion broke something" but are really the
same class of pre-existing race the fixed sleep happened to paper over:

1. **Premature resolution on a substring or persistent string.** `expectFrame(lastFrame, X)`
   resolves the instant `X` is a substring of the CURRENT frame, even a stale/transient one —
   e.g. waiting for `'following'` when the frame already says `'not following'`, or `'@bob'` when
   that's already visible as a post author in a feed list one screen before the profile screen
   that's supposed to show it. Always pick a target unique to the _settled_ state (a screen
   header, a badge like `'[1] photo.png'` not bare `'photo.png'`), or use a compound predicate
   (`f.includes(X) && !f.includes(Y)`).
2. **A poll that resolves instantly removes the incidental settle time a fixed sleep gave
   React/Ink's effects to resubscribe.** `press()` called synchronously right after a resolved
   `waitForFrame` can be silently dropped if it depends on a `useInput` handler whose closure
   hasn't caught up yet (post-login global keys, `loadMore` right after its hint text appears).
   Symptom: the frame just stops changing and the wait times out. Fix: keep one small
   `await flush()` between a resolved wait and the next `press()` when that press depends on an
   effect resubscribing — this is a deliberate, narrow exception to "no fixed sleeps".

**How to actually verify the fix, not just "the file passed a few times":** run the changed test
in isolation (`vitest run <file> -t "<exact title>"`) — a whole-file run can pass because an
earlier test in the same file warms up something (first bcrypt hash, first module import) the
target test silently depends on. In zsh, split multi-line command output with
`${(@f)$(...)}`, not `IFS=$'\n'; for x in $var` (zsh doesn't word-split unquoted `$var` like
bash). Also cross-check with a `git worktree add <path> HEAD` containing only your changed files,
to separate "is this bug mine" from "another agent's concurrent uncommitted WIP in the shared
checkout is the actual cause" — see [[concurrent-shared-checkout-hazard]].

Full writeup: `docs/agents/LEARNINGS.md`, 2026-08-18 entry.
