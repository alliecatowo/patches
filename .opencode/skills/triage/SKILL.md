---
name: triage
description: Classify a worker failure and decide retry vs escalate. Use in goal-driver when a handoff is blocked/failed.
---

# Triage / escalation ladder

Ladder: `deepseek-v4-flash` (leaf, 90% tokens) → `opencode/*-free` (free retry) → `gpt-5.6-terra` (senior, 10× deepseek — only on `capability`) → `grok-4-6`/`grok-4-3` (architect replan). `gpt-5.6-sol` only on explicit `escalate: sol` — it's PREMIUM and 20x Luna. See `execution-loop/SKILL.md` queue-first ordering.

Classify first:

- **Env** (port contention, flock, DB down, /tmp inodes, bounded.sh wait, missing .env): retry same model, same packet. Do not escalate.
- **Capability** (model couldn't reason, hit context ceiling, flaky tool use): retry with next rung (`deepseek → free → terra`). One retry only; two identical failures → change approach or replan.
- **Semantic** (task spec wrong, arch assumption false, repeated same-root failures across tasks, requirement contradicts design): fresh `architect` session with concise replan packet (goal, current plan slice, failing tasks, diff, why assumption broke). Never dump full transcripts.

For premium exhaustion (weekly fair-use cap on `sol/kimi-k3/claude-opus*`): fall back to standard tier (`grok-4-6`/`terra`/`deepseek`) immediately — don't burn Reset Passes.

Free-model fallback: `opencode/muse-spark-1.2-contributor-free`, `nemotron-3-ultra-free`, `mimo-v2.5-free` are zero-cost — driver may exhaust them before paid retries. Document fallback used in handoff.
