---
name: execution-loop
description: Queue-first PR/board triage for goal-driver — classify before reading bodies, enforce disjoint ownership and deepseek-first ladder.
---

# Execution loop (goal-driver)

Queue-first. Classify before you read.

1. **PR triage (cheap):** `gh pr list --json number,isDraft,mergeStateStatus,statusCheckRollup,headRefName` → map each to `MERGE_NOW` (CLEAN+all required SUCCESS), `NEEDS_REBASE` (DIRTY/CONFLICTING), `NEEDS_FIX` (UNSTABLE/BLOCKED with failed required), `OBSOLETE` (patch-id dup via `git patch-id`), `SKIP_DRAFT` (draft with no `Fixes` or WIP).
2. **Board triage:** `projects_list`/`projects_get` → ready Todo ∩ not Blocked → disjoint file sets. Prefer bundling same-phase/spec items (e.g. ADR 0035 `359+362`) into one packet when file overlap <20% — one wider `deepseek` worker > two narrow ones.
3. **Dispatch ladder:** free `opencode/*` first; `deepseek-v4-flash`/`qwen3.7-flash` second; `deepseek-v4-pro` third; `gpt-5.6-terra` only for integration or capability retry; `grok-4-6` only for semantic replan.
4. **Packet:** concise scope and acceptance; bundled packets may be wider when the worker owns integration and delegates disjoint leaves. Scoped validation only (`mise run check <ws>`).
5. **Consume:** ≤20-line handoff per `handoff/SKILL.md`; env retry cheap, capability → terra once, semantic → fresh `grok` architect with concise packet.
6. **Follow-ups:** when a handoff's `Follow-ups:` lists issue URL(s), confirm they landed on Project #5 (`projects_get`), set their Status (`Todo`, or `Blocked` with `Blocked by` = prerequisite Task IDs), and enqueue them for a future packet. These are real discovered work, not speculation — fold them into triage (step 1), but never edit a board item a worker didn't own or file.

7. **Fan-out:** maintain up to 40 active disjoint workers at the driver tier. Workers with broad
   ownership may use `task` to fan out up to four leaf agents, preserving exact file ownership and
   returning one integrated handoff.
