---
name: phase
description: Orchestration playbook for starting a roadmap phase — expand tasks, route models, fan out implementers in parallel, then review/verify/docs/audit. Use for /phase <n>.
invocation: user
allowedTools: Read, Edit, Grep, Agent
---

# /phase $ARGUMENTS

`$ARGUMENTS` is a phase number (`0`–`7`). Orchestration playbook for the main session — you (the orchestrator) run this, not a subagent, because it fans out subagents itself.

## 1. Read

- `docs/product/roadmap.md`'s section for this phase (success criteria) and the matching spec section (`INITIAL_VISION.md` §134–141 for phase details, plus the acceptance checklist §157–160 that applies).
- `tasks.md`'s section for this phase — the existing `P<n>-<nnn>` items are a starting outline, not necessarily granular enough to hand to an implementer directly.

## 2. Expand into concrete tasks with disjoint file sets

For each `P<n>-<nnn>` item, break it down until each piece:

- maps to one package or one clearly-bounded slice of a package,
- doesn't require another piece to land first within the same fan-out wave (sequence waves if there's a real dependency, e.g. entities before services before controllers before TUI),
- has an obvious "done" (a file exists, a test passes, an RPC responds).

Add the expanded items to `tasks.md` under the phase section via `/task add` (reuse the same `P<n>-<nnn>` numbering, don't invent a new prefix).

## 3. Route models

Use `docs/agents/MODEL_ROUTING.md`. Default: `implementer` (sonnet) for the work itself, `researcher` (sonnet) first if the task touches unverified tech, `verifier` (haiku) between waves, `reviewer` (opus) before merge, `docs-writer` (sonnet) to close out. Escalate to `architect` (opus) if a task turns out to need a design decision instead of just implementation.

## 4. Fan out implementers in parallel

One `Agent` call per task, all in a single message so they run concurrently. Each brief must include:

- **Task ID** and the exact acceptance criteria (copy from tasks.md/roadmap, don't paraphrase loosely)
- **Read list**: which `docs/research/*.md` and `.claude/rules/*.md` apply
- **Allowed paths**: the exact disjoint file set — be explicit that other agents own everything else, and that `git add -A` is forbidden
- **Verification**: `pnpm verify` (or scoped) must pass before it reports done
- **Commit rules**: Conventional Commits, only its own paths staged
- **Report format**: task ID, files touched, verification result, deviations, follow-ups, learnings (matches `implementer`'s own report format — just reinforce it)

Only fan out tasks that are genuinely independent in this wave; sequence dependent ones into a later message after the first wave reports back.

Implementers commit on their own worktree branches and report the branch name; the orchestrator
merges the wave's branches into the feature branch, then runs one `verifier` pass.

## 5. After each wave

1. `reviewer` on the diff (or the touched packages) — read its findings, decide blockers vs. follow-ups.
2. `verifier` for a full (not just scoped) `pnpm verify` pass once all of a wave's implementers report done.
3. `docs-writer` to sync docs for what landed.

## 6. End of phase

1. `/audit <phase>` — spec-auditor sweeps the phase's acceptance checklist and files any gaps.
2. Check the phase's acceptance checklist in `docs/product/roadmap.md` / `INITIAL_VISION.md` line by line; update the roadmap status line honestly (don't mark a phase done with open blockers).
3. Only then start the next phase's `/phase <n+1>`.
