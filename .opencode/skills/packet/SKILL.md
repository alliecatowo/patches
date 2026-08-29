---
name: packet
description: Create a concise bounded task packet for delegating work to a cheap worker. Use when fanning out implementation work from goal-driver or architect.
---

# Task packet (driver → worker)

Create a ≤25-line packet when bundling a same-phase slice (e.g. all ADR 0035 reservation + tests); otherwise ≤15 lines for single-ticket work. Do NOT copy the parent transcript. Let workers inspect the repo themselves.

Template — paste and fill (single ticket):

```
Task: <P<n>-nnn / H-nnn / B-nnn>
Objective: <one sentence — what to build>
Scope files: <exact allowed paths, disjoint from other workers>
Forbidden: <paths you must NOT touch>
Acceptance: <how to know it's done — tests, RPC, doc, screenshot>
Constraints: <hard rules that apply — layering, no offset pagination, etc>
Prior findings: <1-2 lines from previous attempts, or "none">
Validation: `mise run check <ws>` (scoped, via bounded.sh) — never full verify for leaf
Handoff: return concise ≤20-line report (status/summary/files/tests/blocker class/confidence/next)
Model: <llmgateway/deepseek-v4-flash | gpt-5.6-terra | grok-4-6> (see MODEL_ROUTING)
```

Bundled phase slice (when driver bundles same-spec items, e.g. ADR 0035):

```
Tasks: <B-nnn, B-mmm, A-kkk> (same phase/spec, file overlap <20%)
Objective: <one sentence covering the slice — e.g. land ADR 0035 reservation guarantee across server+TUI+tests>
Scope files: <phase slice paths, e.g. apps/server/src/conversations/**, apps/tui/src/e2ee/**, apps/server/test/reservation*.test.ts>
Forbidden: <always-forbidden global paths + other workers' slices>
Acceptance: <all tasks' acceptance combined — each task's tests/RPC/doc passes; Fixes #N for each issue>
Constraints: <same as single>
Prior findings: <1-2 lines per task or "none">
Validation: `mise run check <ws>` per touched workspace, then one `mise run check <most-touched>`
Handoff: one ≤20-line report but list per-task status (Task B-nnn: done/left, Task B-mmm: ...)
Model: llmgateway/deepseek-v4-flash (bundled slices stay on deepseek; terra only on retry if bundled slice hits capability)
```

Rules:

- One packet per worker. Disjoint file sets — two workers never share a file (bundled tasks in one packet count as one worker).
- Max 4 concurrent workers (worktree + TURBO_CACHE_DIR + bounded.sh contention). Prefer 2-3 wider bundled workers over 4 narrow ones for same-phase work — each agent does more per spawn, less harness churn.
- Wider chunks stay on `deepseek-v4-flash`; only split a bundle if `mise run check` exceeds ~3min or files truly diverge.
- Use `WebSearch/WebFetch` in the packet only if the worker will need it — don't preload docs the worker can fetch itself.
- Ladder is cheap-first: `deepseek-v4-flash` → `opencode/*-free` → `gpt-5.6-terra` only on `handoff blocker=capability` (see `triage/SKILL.md`). Never start a leaf at `terra` — `terra $2/$12` is 10× `deepseek $0.22` for marginal finesse.
- Triage before bodies: PR queue is `MERGE_NOW/NEEDS_REBASE/NEEDS_FIX/OBSOLETE` via `gh pr list --json`, not `gh pr view` per-PR.
