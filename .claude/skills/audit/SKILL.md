---
name: audit
description: Spawn the spec-auditor over the current phase's acceptance checklist and the whole codebase, merge its findings into tasks.md, and summarize. Use for /audit [phase].
invocation: user
allowedTools: Agent, Read, Grep
---

# /audit $ARGUMENTS

`$ARGUMENTS` optionally names a phase (`0`..`7`) or checklist (`v0`, `mvp`, `federation`). If omitted, infer the current phase from `docs/product/roadmap.md`'s status line and `tasks.md`'s open items.

## Procedure

1. Determine which spec checklist applies (spec §157 Phase 0, §158 v0, §159 MVP deploy, §160 federation readiness) and which roadmap phase(s) in `tasks.md` are in scope.
2. Delegate to the `spec-auditor` agent with: the checklist section, the phase's task IDs, and instruction to sweep the whole codebase for hard-rule violations regardless of phase (§153 applies always).
3. `spec-auditor` files its own findings directly into `tasks.md` under `## Backlog / discovered` as `A-<nnn>` — you don't need to transcribe them, just confirm they landed (`git diff tasks.md` or re-read the section).
4. Summarize for the user: checklist status (met/not met/unverifiable), count and severity of new `A-<nnn>` tasks, any hard-rule violations (call these out first, they're urgent), and the auditor's recommendation on whether to proceed to the next phase or whether a `fable` deep-audit pass is warranted.

Don't run this more than once per phase boundary unless asked — it's an opus-effort-xhigh agent, not a cheap sanity check; use `/verify` and normal review for routine work.
