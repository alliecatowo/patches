---
name: audit
description: Spawn the spec-auditor over the current phase's acceptance checklist and the whole codebase, confirm its findings landed on the Project board, and summarize. Use for /audit [phase].
invocation: user
allowedTools: Agent, Read, Grep, mcp__github__projects_list, mcp__github__projects_get
---

# /audit $ARGUMENTS

`$ARGUMENTS` optionally names a phase (`0`..`7`) or checklist (`v0`, `mvp`, `federation`). If omitted, infer the current phase from `docs/product/roadmap.md`'s status line and the [Project board](https://github.com/users/alliecatowo/projects/5)'s open items (`projects_list`/`projects_get`).

## Procedure

1. Determine which spec checklist applies (spec §157 Phase 0, §158 v0, §159 MVP deploy, §160 federation readiness) and which roadmap phase(s) on the Project board are in scope.
2. Delegate to the `spec-auditor` agent with: the checklist section, the phase's task IDs, and instruction to sweep the whole codebase for hard-rule violations regardless of phase (§153 applies always).
3. `spec-auditor` files its own findings directly onto the Project board as `A-<nnn>` draft items (`projects_write` — `add_project_item`), converting to a real issue only once an implementer is about to pick one up — you don't need to transcribe them, just confirm they landed (`projects_list`/`projects_get` filtered to Kind or Task ID prefix `A-`). Falls back to `tasks.md` only if the MCP server or `project` scope is unavailable.
4. Summarize for the user: checklist status (met/not met/unverifiable), count and severity of new `A-<nnn>` tasks, any hard-rule violations (call these out first, they're urgent), and the auditor's recommendation on whether to proceed to the next phase or whether a `fable` deep-audit pass is warranted.

Don't run this more than once per phase boundary unless asked — it's an opus-effort-xhigh agent, not a cheap sanity check; use `/verify` and normal review for routine work.
