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
Handoff: return concise ≤20-line report (status/summary/files/tests/blocker class/confidence/next + Follow-ups: <issue URLs>)
Model: <llmgateway/deepseek-v4-flash (reasoning: medium-low) | gpt-5.6-terra (medium-high, only on blocker=capability) | grok-4-6 (high)> (see MODEL_ROUTING)
```

Rules:

- **Workers may and should file follow-ups they discover** (see `handoff/SKILL.md`): `gh issue create --repo alliecatowo/patches` + add to Project #5, body with scope/evidence/acceptance/blocked-by Task IDs/labels, then report the URL in the handoff. One issue per follow-up; never touch board items outside the ones you filed.
- One packet per worker. Disjoint file sets — two workers never share a file.
- The driver may dispatch up to 40 concurrent workers when file ownership is disjoint. Prefer 2-4
  squad-capable workers for broad phase slices; a squad worker may fan out up to four leaf agents at
  the next tier. Never overlap a file set, and never use concurrency to bypass review or validation.
- Use `WebSearch/WebFetch` in the packet only if the worker will need it — don't preload docs the worker can fetch itself.
- Ladder is free-first: `opencode/*-free` → `llmgateway/deepseek-v4-flash` → `llmgateway/qwen3.7-flash` → `deepseek-v4-pro` → `gpt-5.6-terra` → `grok-4-6`. Never start routine work at Terra or Grok.
- Triage before bodies: PR queue is `MERGE_NOW/NEEDS_REBASE/NEEDS_FIX/OBSOLETE` via `gh pr list --json`, not `gh pr view` per-PR.
