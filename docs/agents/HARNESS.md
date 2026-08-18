# The Patches agent harness

How the Claude Code harness in this repo is put together, and how to extend it.
`CLAUDE.md` imports this file every session — keep it ≤120 lines.

## Layout

```
.claude/agents/    subagent definitions (roster below)
.claude/skills/    slash commands (roster below)
.claude/rules/     path-scoped conventions, loaded only when matching files are touched
.claude/hooks/     guard-bash.sh, format-file.sh, session-start.sh
.claude/settings.json   permissions + hook wiring
docs/agents/       this file, LEARNINGS.md, MODEL_ROUTING.md, PACKAGE_CONVENTIONS.md
```

## Hooks

- **`guard-bash.sh`** (PreToolUse on Bash): blocks `npm install/i/add/ci/...`, `yarn`, `npx`
  (pnpm only), `git push --force`, and new `synchronize: true` occurrences. Exit 2 blocks the
  command and shows the reason.
- **`format-file.sh`** (PostToolUse on Write/Edit): runs Prettier on the touched file
  (best-effort, never fails the tool call), plus `buf format -w` for `.proto` files.
  Convenience only — `pnpm verify`/`/verify` is the real gate.
- **`session-start.sh`** (SessionStart): prints open/done task counts, the next open tasks,
  and the `docs/agents/LEARNINGS.md` entry count, so every session starts oriented without
  asking.

## Agent roster

| Agent           | Model                      | Purpose                                                 | Delegate when                                   |
| --------------- | -------------------------- | ------------------------------------------------------- | ----------------------------------------------- |
| `researcher`    | sonnet, high               | Verified `docs/research/*.md` notes, official docs only | before implementing/updating risky tech         |
| `implementer`   | sonnet, high, memory       | Ships one scoped task, verified + committed             | any concrete `P<n>-nnn`/`H-nnn` task            |
| `reviewer`      | opus, high, read-only      | Findings against §153/§128–129/§101–104/tests           | after implementer finishes, before merge        |
| `architect`     | opus, xhigh                | ADRs, cross-cutting design, deviations                  | expensive-to-reverse or cross-package decisions |
| `verifier`      | haiku, low                 | Runs the check sequence, reports pass/fail              | before commits, between phase waves             |
| `docs-writer`   | sonnet, medium             | Syncs docs to actual code/commands                      | after a feature lands, phase close-out          |
| `spec-auditor`  | opus, xhigh, read+tasks.md | Gaps/violations vs spec, files `A-nnn` tasks            | phase boundary, `/audit`                        |
| `harness-tuner` | sonnet, medium             | Improves this harness itself                            | learnings pile up, repeated friction            |

Full prompts live in `.claude/agents/<name>.md`. Nested delegation is allowed to depth 3
(e.g. `implementer` → `researcher`).

## Skills

| Skill                         | Does                                                                |
| ----------------------------- | ------------------------------------------------------------------- |
| `/task add\|done\|list\|next` | Manage `tasks.md` consistently                                      |
| `/verify [package]`           | Canonical check sequence, scoped or full                            |
| `/retro`                      | Append a `LEARNINGS.md` entry, update the harness if it implies one |
| `/audit [phase]`              | Spawn `spec-auditor`, merge findings, summarize                     |
| `/proto-change`               | Safe `.proto` edit workflow                                         |
| `/migration <Name>`           | Safe TypeORM migration workflow                                     |
| `/phase <n>`                  | Orchestrate a whole roadmap phase                                   |

## Rules

Path-scoped, loaded automatically when matching files are touched: `server.md`
(`apps/server,worker,admin`), `database.md` (`packages/database`), `proto.md`
(`packages/proto`), `tui.md` (`apps/tui`, `packages/terminal-media`), `docs.md`
(`docs/**`, `README.md`).

## The self-improvement loop

Do the task → `/verify` → commit → `/retro` (record what was learned; fix the rule/prompt/
research doc it implies, in the same change if small) → periodically, `harness-tuner` sweeps
`LEARNINGS.md` + git history for batched improvements → at phase boundaries, `/audit` sweeps
the codebase against the spec and files `A-nnn` tasks. This loop is why the harness is
expected to get better as the project proceeds, not just accumulate agents.

## Parallel-agent conventions

- Give every fanned-out agent a **disjoint file set** and say so explicitly in its brief.
- **Never `git add -A`/`git add .`** — other agents may have half-done files in the tree;
  stage explicit paths only.
- Wrap concurrent `pnpm add` in `flock /tmp/patches-pnpm.lock` — see
  `docs/agents/PACKAGE_CONVENTIONS.md`.
- Model routing: `docs/agents/MODEL_ROUTING.md`.

## How to tweak this harness

Edit `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, `.claude/rules/*.md`, or the hooks
directly — this is normal, in-scope work, not a special case. Keep `CLAUDE.md` short by
moving detail here or into a rule/doc. Run `harness-tuner` when friction has accumulated
rather than waiting for it to become a crisis. Never use a harness edit to weaken a hard rule
(spec §153, layering §128–129, security §101–104) — that requires an ADR and human sign-off.
