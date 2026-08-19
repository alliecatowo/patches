---
name: shared-checkout-file-lands-in-other-agent-commit
description: a file you own and edited can get swept into another concurrent agent's commit before you commit it yourself, in this shared-checkout harness
metadata:
  type: feedback
---

In this repo's shared-working-directory multi-agent setup ([[concurrent-shared-checkout-hazard]],
[[shared-checkout-branch-switches]]), two agents can be assigned overlapping ownership of the
_same_ file for different reasons (e.g. one agent owns `apps/admin/src/commands/user.ts` for
moderation-log-entry writes, another owns it for account-deletion CLI commands). If the other
agent commits that file with `git add <path> && git commit` while your uncommitted edits are
already sitting in the working tree, their commit captures your changes too — under their
commit message, not yours.

**What to do about it**: before your own final commit pass, `git status --short`/`git diff` on
every file you believe you edited. If one shows no diff against HEAD even though you know you
touched it, `git log --oneline -3 -- <path>` and `git show <commit> --stat` to confirm someone
else's commit already carries your content (grep the committed file for your specific additions
to be sure it's not just coincidentally similar). If confirmed, there is nothing to commit —
don't try to re-commit or revert-and-redo. Just verify the content is correct and note the
situation plainly in your final report so the discrepancy between "task's file ownership list"
and "actual commit attribution" is visible, rather than silently treated as your own commit
count being short.

**Why**: this happened for `apps/admin/src/commands/user.ts` during the P14 server-follow-ups
task (2026-08-19) — the SUSPEND/BAN `moderation_log_entries` writes I made landed inside another
agent's `feat(admin): user deletion-status and cancel-deletion commands` commit rather than my
own, purely because they committed the shared file a few minutes after I'd edited it in place.
