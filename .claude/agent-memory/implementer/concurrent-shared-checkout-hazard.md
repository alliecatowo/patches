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

**Near-miss (backlog sweep session, 2026-08-18):** ran `git commit -m "..."` for a B-012
change with no trailing `-- <paths>` (every other commit that session used explicit paths).
Because other agents had files staged in the same shared index at that moment, the commit
swept in ~15 unrelated files (`apps/tui/**`, etc.) that weren't even `git add`ed by this
task — `git commit` with no pathspec commits the whole index, not "whatever I `git add`ed
this turn." Caught immediately via `git show --stat HEAD` (expected 5 files, saw 20) while
the bad commit was still local/unpushed, fixed with `git reset --soft HEAD~1` (restores the
index exactly, including other agents' staged-but-uncommitted files) followed by
`git commit -- <exact paths>`. **Always pass an explicit `-- <paths>` (or `git status`-verify
the index is exactly your files) before every `git commit`, with zero exceptions, even for a
"just this once" quick commit** — and always run `git show --stat HEAD` right after committing
to confirm the file count/list matches what you intended, before pushing.

**Diagnostic technique — isolate "is this bug mine" from "another agent's concurrent WIP is the
cause" (TUI de-flake task, 2026-08-18):** a test started failing reliably mid-session while other
agents had large uncommitted diffs to files outside this task's scope (`apps/app/App.tsx`,
`ProfileScreen.tsx`, `fake-api.ts`). Rather than debugging blind against a constantly-mutating
shared tree, ran `git worktree add /tmp/<name> HEAD` (clean, committed state only — none of the
other agents' uncommitted WIP), copied over _only_ this task's own changed files, built the
workspace packages it needed (`pnpm --filter @patches/<pkg> build` for each `dist`-less
dependency), and reran the failing test there. It failed identically with zero other agents'
files present — proving the bug was this task's own, not caused by the concurrent WIP. Cheap,
conclusive, and avoids fruitlessly diffing/reverting files you don't own in the live shared tree.
Clean up with `git worktree remove <path> --force`.
