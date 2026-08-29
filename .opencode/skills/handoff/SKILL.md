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
Follow-ups: <issue URLs you filed, or "none">
Unresolved: <what's left, or "none">
Blocker class: none | env (port/DB/flock/inode) | capability (model limit) | semantic (spec/arch wrong)
Confidence: high | medium | low
Next: <recommended action — accept / retry with senior-worker / replan with architect / file A- gap>
```

Rules:

- Commit green slices before handoff (`git add <explicit paths> && git commit`).
- **File every concrete follow-up you discover as a real GitHub issue, don't just report it.** Create with `gh issue create --repo alliecatowo/patches`, add it to Project #5 (`gh project item-add <number> --owner alliecatowo` or `mcp__github__projects_write`), and paste the issue URL in the `Follow-ups:` line.
- A follow-up is concrete enough to file when it names actual scope and evidence from this task. Include in its body: scope, evidence (file:line or observed behaviour), acceptance criteria, any prerequisite/blocked-by Task IDs, and labels when known. File one issue per follow-up; never bundle unrelated items.
- Preserve least privilege and secret safety: never put passwords, tokens, DM/log/error bodies, or anything secret into an issue. Prefer `Status: Todo` (or `Blocked` with `Blocked by` set); never move or edit board items outside the ones you filed.
- Env blockers never escalate to architect — retry cheap.
- If you hit a pricing/cliff or model limit, name it explicitly so driver can pick the fallback chain (`deepseek → opencode/free → qwen`, or `terra` before `sol`).
