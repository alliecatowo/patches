---
name: shared-checkout-commit-needs-explicit-pathspec
description: git commit without -- <paths> swept up other agents' already-staged files in a shared checkout
metadata:
  type: feedback
---

`git add <my explicit paths>` then a plain `git commit -m "..."` (no pathspec on the commit
itself) commits the _entire index_ — including anything another concurrent agent staged with
their own `git add` between my `git add` and my `git commit`. This landed several files I never
touched (an admin CLI command, a label-seed service, an integration test) inside my commit
message/attribution, even though I never staged them myself.

**Why:** in this repo's shared-checkout setup (see [[concurrent-shared-checkout-hazard]] and
[[shared-checkout-file-lands-in-other-agent-commit]]), multiple agents interleave `git add`
calls on the same index with no locking. `git add <paths>` only guarantees _my_ files are
staged — it says nothing about what else is staged by the time `git commit` actually runs.

**How to apply:** always pass the same explicit pathspec to `git commit -- <paths>` as was
passed to `git add <paths>`, even though it looks redundant. `git commit -- <pathspec>` commits
only those paths (using their current working-tree content) and leaves the rest of the index
untouched, regardless of what anyone else staged. Never rely on "I only `git add`ed my files" as
sufficient — by commit time that may no longer be true. If a bad commit like this already
happened and nothing has been pushed yet, `git reset --soft HEAD~1` (never `--hard`) restores
the pre-commit staged state losslessly; but check `git log` first — if another agent has already
committed on top, do not rewrite history at all, just note the mixed attribution and move on.
