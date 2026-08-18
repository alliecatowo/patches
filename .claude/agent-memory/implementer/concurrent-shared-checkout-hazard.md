---
name: concurrent-shared-checkout-hazard
description: multiple agents can run against the exact same working directory/git checkout on this project's branch simultaneously, not isolated worktrees — expect files you didn't touch to change under you and commits/HEAD to move between your own tool calls
metadata:
  type: project
---

Observed during the P3-001/P3-002/P1-014/B-018 implementation task (2026-08-18, branch
`feat/phase-0-foundation`): partway through the session, `git status` started showing
unrelated files change (e.g. `apps/tui/**`, `.claude/agent-memory/implementer/MEMORY.md`) that
this task never touched, and `HEAD` advanced between consecutive `git log`/`git diff` calls
with no `git pull`/`git fetch` run in between. Content this session had already committed
(e.g. `docs/architecture/api.md`, then later several `apps/server/test/*.integration.test.ts`
files) reappeared as uncommitted diffs after a routine `git pull --rebase`, apparently reset
to pre-change content by a concurrent commit/rebase interaction, and had to be recommitted
from the working tree's actual (still-correct) state.

**Why this matters:** This is not the "give each fanned-out agent a disjoint file set"
scenario `docs/agents/HARNESS.md` describes — that assumes isolated worktrees/clones. Here,
multiple agents (at least one TUI-focused agent) were operating against the literal same
checkout at the same time, so `git status`/`git diff`/`HEAD` are not stable between one tool
call and the next, and staging with explicit paths (never `-A`) is necessary but not
sufficient — a commit believed to be complete can lose content to a concurrent rebase before
it's pushed.

**How to apply:** On this project, treat every `git status`/`git diff` as a snapshot that may
already be stale by the next tool call. Commit and `git pull --rebase && git push` in small,
frequent slices rather than batching a large diff for one final commit. After any
`git pull --rebase`, re-check `git status`/`git diff` for your own paths before assuming your
prior commit's content survived intact — if a file you already committed shows as modified
again with your own content on the "working tree" side, that's this hazard, not your error;
recommit from the current working tree state and say so in the commit message. Never assume a
file is unchanged just because you haven't touched it this turn.
