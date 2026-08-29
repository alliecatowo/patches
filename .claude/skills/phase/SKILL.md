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
- The [Patches GitHub Project board](https://github.com/users/alliecatowo/projects/5) filtered to this Phase (`projects_list`/`projects_get`) — the existing `P<n>-<nnn>` items (issues or drafts) are a starting outline, not necessarily granular enough to hand to an implementer directly. Fall back to `tasks.md`'s section for this phase if the board or `project` scope is unavailable.

## 2. Expand into concrete tasks with disjoint file sets

For each `P<n>-<nnn>` item, break it down until each piece:

- maps to one package or one clearly-bounded slice of a package,
- doesn't require another piece to land first within the same fan-out wave (sequence waves if there's a real dependency, e.g. entities before services before controllers before TUI),
- has an obvious "done" (a file exists, a test passes, an RPC responds).

Add the expanded items to the Project board via `/task add` with Phase set to this phase (reuse the same `P<n>-<nnn>` numbering, don't invent a new prefix). `/task add` promotes each to a real issue since it's about to be assigned to an implementer.

## 3. Route models

Use `docs/agents/MODEL_ROUTING.md` + `HETEROGENEOUS.md`. Default: `worker` (`deepseek-v4-flash` 140k) for the work itself, `researcher` (`qwen3.7-flash` 120k + WebSearch) first if unverified tech, `verifier` (`gpt-5.6-luna` 90k) between waves, `senior-worker`/`reviewer` (`gpt-5.6-terra` 220k) before merge, `docs-writer` (`qwen3.7-flash`) to close out. Escalate to `architect` (`grok-4-6` 180k) only if semantic/planning problem.

## 4. Fan out workers in parallel (≤4 concurrent, see `HETEROGENEOUS.md`)

One `Task` (subagent) per packet via `.opencode/skills/packet/SKILL.md`, all in one message. Each packet: Task ID + acceptance, scope files (disjoint, ≤4 workers total), forbidden paths, constraints, prior findings, `mise run check <ws>` (scoped via `bounded.sh` — never full `verify` for leaf), commit rules (`git add <explicit>` + `Fixes #<n>`), handoff shape (`.opencode/skills/handoff/SKILL.md` ≤20 lines). Workers inspect repo themselves; don't paste full history. No `git worktree add` by hand — work in main checkout with disjoint paths; isolation is opt-in only when file sets truly conflict.

Sequence dependent waves into a later message. `goal-driver` consumes handoffs and decides retry (`triage` skill) before next wave.

## 5. After each wave

1. `reviewer` on the diff (or the touched packages) — read its findings, decide blockers vs. follow-ups.
2. `verifier` for a full (not just scoped) `pnpm verify` pass once all of a wave's implementers report done.
3. `docs-writer` to sync docs for what landed.

## 6. End of phase

1. `/audit <phase>` — spec-auditor sweeps the phase's acceptance checklist and files any gaps.
2. Check the phase's acceptance checklist in `docs/product/roadmap.md` / `INITIAL_VISION.md` line by line; update the roadmap status line honestly (don't mark a phase done with open blockers).
3. Only then start the next phase's `/phase <n+1>`.
