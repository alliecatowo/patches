---
name: packet
description: Create a concise bounded task packet for delegating work to a cheap worker. Use when fanning out implementation work from goal-driver or architect.
---

# Task packet (driver → worker)

Create a ≤15-line packet. Do NOT copy the parent transcript. Let workers inspect the repo themselves.

Template — paste and fill:

```
Task: <P<n>-nnn / H-nnn / B-nnn> (+ bundle B-mmm if same phase/spec — one PR per agent, not per issue)
Objective: <one sentence — what to build>
Scope files: <exact allowed paths, disjoint from other workers>
Forbidden: <paths you must NOT touch>
Acceptance: <how to know it's done — tests, RPC, doc, screenshot>
Constraints: <hard rules that apply — layering, no offset pagination, etc>
Prior findings: <1-2 lines from previous attempts, or "none">
Validation: `mise run check <ws>` (scoped, via bounded.sh — turbo+lint cached, ~2s warm) — never full verify for leaf; one `turbo lint` handles eslint
Handoff: return concise ≤20-line report (status/summary/files/tests/blocker class/confidence/next)
Model: <llmgateway/deepseek-v4-flash (reasoning: medium-low) | gpt-5.6-terra (medium-high, only on blocker=capability) | grok-4-6 (high)> (see MODEL_ROUTING)
```

Rules:

- One packet per worker. Disjoint file sets — two workers never share a file.
- Max 6 concurrent workers prefer 2-3 wider bundled phase-slice PRs (same spec file, ≤25 lines) over 4 narrow — one PR bundles multiple B-nnn when scope overlaps <20% (fixes PR sprawl).
- Use `WebSearch/WebFetch` in the packet only if the worker will need it — don't preload docs the worker can fetch itself.
- Ladder is cheap-first: `deepseek-v4-flash` → `opencode/*-free` → `gpt-5.6-terra` only on `handoff blocker=capability` (see `triage/SKILL.md`). Never start a leaf at `terra` — `terra $2/$12` is 10× `deepseek $0.22` for marginal finesse.
- Triage before bodies: PR queue is `MERGE_NOW/NEEDS_REBASE/NEEDS_FIX/OBSOLETE` via `gh pr list --json`, not `gh pr view` per-PR.
