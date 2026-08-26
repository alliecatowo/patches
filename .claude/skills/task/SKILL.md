---
name: task
description: Add, complete, list, or find the next task on the Patches GitHub Project board, keeping ID allocation consistent. Use for /task add|done|list|next <text>.
invocation: user
allowedTools: Read, Bash(grep:*), Bash(sed -n:*), mcp__github__projects_list, mcp__github__projects_get, mcp__github__projects_write
---

# /task $ARGUMENTS

The [Patches GitHub Project board](https://github.com/users/alliecatowo/projects/5) (user-level
Project v2, owner `alliecatowo`, project number 5) is the live task board. Items are a mix of real
GitHub issues on `alliecatowo/patches` (preferred — closeable by a PR, auto-moves Status to Done)
and draft items not yet promoted, with fields Status (Todo | Blocked | In Progress | Done), Phase
(Phase 12 — TUI | Phase 13 — E2EE | Phase 15 — Auth | Phase 17 — Scale | Phase 19 — Observability |
Phase 20 — Live bugs | Phase 21 — Web DX | Backlog), Priority (P0 — Critical | P1 — High | P2 —
Normal | P3 — Low), Kind (Bug | Feature | Infra / CI | Security | Perf / Scale | Docs | Harness |
Refactor / Test), Task ID (text, `P<phase>-<nnn>` / `H-<nnn>` / `B-<nnn>` / `A-<nnn>` / `O-<nnn>` /
`S-<nnn>` / `MCP-<nnn>`), Blocked by (text, comma-separated Task IDs), Order (number). Access via
the `github` MCP server: `projects_list`/`projects_get` to read, `projects_write` to write,
`issue_write` to create/update issues. `tasks.md` is the historical archive (447 completed items)
and the offline fallback when the MCP server or the `project` OAuth scope is unavailable — nobody
ticks items off in it any more.

Parse `$ARGUMENTS` as `<subcommand> <rest>`.

## add <description> [--phase <name>] [--priority <Pn>] [--kind <kind>] [--id <prefix>]

1. Determine Phase from `--phase` or context (which phase/area the description is about); default
   to `Backlog` if unclear. Determine Priority and Kind similarly, defaulting to `P2 — Normal` and
   the closest matching Kind.
2. Determine the ID prefix (`P<phase>` for a roadmap phase, `H` for Harness, `B` for backlog/
   discovered-but-not-audit, `A` for spec-auditor findings, `O`/`S`/`MCP` per their existing use).
3. Allocate the next Task ID: `projects_list`/`projects_get` and find the highest existing number
   for that prefix in the `Task ID` field across the board. If the board or `project` scope is
   unavailable, fall back to `grep -oE '\b(P[0-9]+|H|B|A|O|S|MCP)-[0-9]+\b' tasks.md | sort -t- -k2 -n | tail -1`
   (filter to your prefix first) as the last-known-used number. Allocate `next = highest + 1`,
   zero-padded to 3 digits.
4. For actionable work (something an implementer can start now), create a real issue:
   `gh issue create --repo alliecatowo/patches --title "<ID> — <title>" --body-file <file>`, then
   add it to the board (`add_project_item` with the issue) and set Task ID/Status=Todo/Phase/
   Priority/Kind. For work not ready to start, file a draft item instead (`add_project_item` with
   Status=Todo, Phase, Priority, Kind, Task ID, description as title/body) — promote it later with
   `convertProjectV2DraftIssueItemToIssue` when work begins.
5. Report the new ID (and issue number, if one was created).

## done <ID or description match>

1. `projects_list`/`projects_get` to find the item by Task ID or title match.
2. If it's a real issue closed by a merged PR referencing `Fixes #N`, Status already moved to Done
   automatically — just confirm. Otherwise (draft item, or an issue not auto-closed),
   `projects_write` (`update_project_item`) to set Status=Done.
3. Report what was marked done.

## list [phase]

`projects_list`/`projects_get`, optionally filtered by Phase, printing Status/Priority/Kind/Task ID
/title as-is. If the board or `project` scope is unavailable, fall back to
`grep -n '^- \[ \]' tasks.md` (open items only — the archive isn't a live substitute) and say so.

## next [n=8]

Query the board for Status=Todo items with no unmet `Blocked by`, ordered by Priority then Order,
capped at `n`. This mirrors what `session-start.sh` points to at session start (it prints the
archive counts, not a live board query, since it must stay offline and instant).

## Rules

- Never renumber an existing Task ID.
- Never delete an item — set Status=Done, or if truly obsolete say so in the description rather
  than deleting.
- One `projects_write` call per add/done — don't batch unrelated items unless using
  `update_project_items` deliberately for a real batch of ≤50.
- Only fall back to editing `tasks.md` when the MCP server or `project` scope is confirmed
  unavailable, and say so explicitly when you do.
