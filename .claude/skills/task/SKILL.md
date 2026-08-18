---
name: task
description: Add, complete, list, or find the next task in tasks.md, keeping ID allocation, checkbox syntax, and section placement consistent. Use for /task add|done|list|next <text>.
invocation: user
allowedTools: Read, Edit, Bash(grep:*), Bash(sed -n:*)
---

# /task $ARGUMENTS

`tasks.md` is the live task board. Conventions (from its own header): `- [ ] ID — description`, checked off with `- [x]`. IDs: `P<phase>-<nnn>` for roadmap phases, `H-<nnn>` for harness tasks, `B-<nnn>` for backlog/discovered-but-not-audit, `A-<nnn>` for spec-auditor findings.

Parse `$ARGUMENTS` as `<subcommand> <rest>`.

## add <description> [--section <name>] [--id <prefix>]

1. Determine the section: infer from `--section`, or from context (which phase/area the description is about), default to `## Backlog / discovered` if unclear.
2. Determine the ID prefix for that section (`P0`, `P1`, … for phase sections, `H` for Harness, `B`/`A` for Backlog).
3. Find the highest existing number for that prefix across the whole file:
   ```
   grep -oE '\b(P[0-9]+|H|B|A)-[0-9]+\b' tasks.md | sort -t- -k2 -n | tail -1
   ```
   (filter to your prefix first). Allocate `next = highest + 1`, zero-padded to 3 digits.
4. Edit the file: insert `- [ ] <ID> — <description>` as the last line of that section's list (Backlog additions go at the **top** of its list, per the file's own convention — "newest audit findings at the top").
5. Report the new ID.

## done <ID or description match>

1. Find the line (`grep -n '<ID>' tasks.md` or match on description text).
2. Edit `- [ ]` → `- [x]` on that exact line. Don't touch anything else on the line.
3. If the task has a trailing `(#issue)` reference, leave it.
4. Report what was checked off.

## list [section]

`grep -n '^- \[ \]' tasks.md` (open) optionally scoped to a section by reading between its `## ` heading and the next `## `. Print as-is, don't reformat.

## next [n=8]

Same as `list` but capped at `n` lines, in file order (which is priority order — earlier phases first). This mirrors what `session-start.sh` already prints at session start.

## Rules

- Never renumber existing IDs.
- Never delete a task — mark it done, or if it's truly obsolete, say so in the entry rather than removing it.
- Keep the file sorted by phase (don't move a task's section without a reason).
- One edit per task — don't batch-rewrite the whole file for a single add/done.
