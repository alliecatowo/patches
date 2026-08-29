---
name: handoff
description: Return a concise structured handoff from worker to driver. Use at the end of every delegated task.
---

# Worker handoff (worker → driver)

Return ≤20 lines, no full transcript. Driver consumes this, not your reasoning.

Template:

```
Task: <ID>
Status: done | partial | blocked | failed
Summary: <1-2 lines — what actually landed>
Files: <touched paths>
Tests: <mise run check <ws>: PASS/FAIL + failing file:line if any>
Findings: <important discoveries, 1-2 lines>
Unresolved: <what's left, or "none">
Blocker class: none | env (port/DB/flock/inode) | capability (model limit) | semantic (spec/arch wrong)
Confidence: high | medium | low
Next: <recommended action — accept / retry with senior-worker / replan with architect / file A- gap>
```

Rules:

- Commit green slices before handoff (`git add <explicit paths> && git commit`).
- Env blockers never escalate to architect — retry cheap.
- If you hit a pricing/cliff or model limit, name it explicitly so driver can pick the fallback chain (`deepseek → opencode/free → qwen`, or `terra` before `sol`).
