---
name: retro
description: After finishing a task, append a learning entry to docs/agents/LEARNINGS.md and update the relevant rule/agent/doc in the same change if the learning implies a behavior change. Use for /retro.
invocation: user
allowedTools: Read, Edit, Grep, Bash(grep:*)
---

# /retro $ARGUMENTS

Use `$ARGUMENTS` as the learning to record if given; otherwise infer it from the task just completed in this session.

## Procedure

1. **Grep first, discourage duplicates**: `grep -i '<keyword>' docs/agents/LEARNINGS.md`. If the same gotcha is already recorded, don't add a near-duplicate — instead check whether the existing entry's "Action taken" is still accurate and update it if not.
2. Append a new entry at the end of `docs/agents/LEARNINGS.md` in this exact format:

```
## YYYY-MM-DD — <short title>

**Context:** <what you were doing when you hit this>

**Learning:** <the non-obvious fact, gotcha, or better pattern — one to three sentences>

**Action taken:** <which file changed as a result: a rule, an agent prompt, a research doc, a hook, or "none — informational only">
```

Use today's actual date. Keep each field brief — this file is read at the start of every session (`session-start.sh` prints the entry count); it should stay skimmable, not become a diary.

3. **If the learning implies a behavior change**, make that change in the _same_ commit:
   - A wrong assumption about a library → fix the `docs/research/*.md` note.
   - A repeated mistake in a package → edit the matching `.claude/rules/*.md`.
   - An agent doing the wrong thing → edit that agent's `.claude/agents/*.md`.
   - A missing guard → consider (don't just do) a `.claude/hooks/*.sh` change; hooks are powerful and shared, prefer a rule/prompt fix unless the mistake is truly mechanical and safe to block automatically.
4. If you're not sure whether a change is warranted, err toward recording it as informational (`Action taken: none — informational only`) rather than making a speculative edit — a `harness-tuner` pass can batch these later.

Don't run `/verify` for a LEARNINGS.md-only change — it's Markdown-only. Do run it if you touched a rule/prompt file that other tooling parses.
