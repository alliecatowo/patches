---
name: shared-checkout-branch-switches
description: On this project, concurrent agents can checkout a *different* branch entirely in the same shared working directory mid-task, not just add/commit files — always re-check `git branch --show-current` and re-`git add` explicit paths right before every commit
metadata:
  type: feedback
---

Extends [[concurrent-shared-checkout-hazard]]: it's not just that other agents' half-done
files sit in the tree. During one implementer session, the working directory's current
branch changed twice mid-task (`feat/phase-0-foundation` → `codex/wip-pages-data` →
`codex/wip-github-auth` → `codex/wip-tui-media`) via other agents' `git checkout`/`rebase`
calls, and the index was reset at least once (a `git add` + later `git commit` produced
"nothing added to commit" because the staged files had been cleared by someone else's
`git reset` in between).

**Why:** A `git commit -m "..."` call can silently no-op (or land on an unexpected branch)
if another agent mutated the shared repo state between your `git add` and `git commit`
calls — there is no isolation between agents sharing one literal directory.

**How to apply:** Right before every commit: (1) `git branch --show-current` to confirm
you're still where you think you are (don't assume the branch named in your task prompt
is still checked out — trust the live state over the prompt), (2) `git status --short`
and re-`git add` your exact file list again even if you already staged them earlier in
the same turn, (3) after `git commit`, verify with `git log --oneline -3` that your
commit actually landed (a `[branch hash] message` line in the commit output is not
sufficient confirmation if you're unsure the preceding `add` succeeded). Before pushing,
`git fetch` + compare `git merge-base HEAD origin/<branch>` against
`origin/<branch>`'s tip rather than assuming a plain `git push` will fast-forward cleanly
— other agents push to the same branch frequently.
