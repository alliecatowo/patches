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

## Token discipline (cache reads are the big cost)

Every model turn re-reads the agent's whole context, so **cost ≈ Σ(context size) over
requests**. Measured 2026-08-19 across all sessions, grouped correctly by `message.id` (method,
full numbers, and the double-count bug this replaces, in `docs/agents/CONTEXT_ECONOMY.md`):
7.62B cache reads total (orchestrator 53%, subagents 47%), 1.13 tool calls/request, only 1% of
requests call no tool at all, 53%/22% of tokens read above a 100k/200k context — subagent
workers average 196k context over 18,676 requests, worst 5 burn 156M–96M tokens each. Ranked:

1. **Cap worker lifetime/context — the #1 lever (53%/22% of tokens above 100k/200k).** At ~100
   requests or 200k context a subagent writes a compact handoff (done/left/owned paths/next step)
   and stops; the orchestrator re-briefs a fresh one. `maxTurns` is a backstop, and an **abort**
   rather than a graceful stop — `.claude/hooks/turn-budget.sh` warns at 15% and 5% remaining so
   the agent can land a commit and write the packet before it hits. **Workers only**
   — the orchestrator may run long; it decides what work exists, and re-briefing it costs more.
2. **Batch independent calls into one request — a real ~2x lever.** 1.13 tool calls/request means
   most requests do one thing when they could do two or three; combine independent reads/edits
   and chain verify steps. Target > 1.5.
3. **Narration is not a real problem — only 1% of requests call no tool.** Still think-then-act,
   but the old "39% pure narration" figure was a measurement bug (double-counted JSONL lines) —
   retired, don't over-invest here.
4. **Never blind-truncate output.** `| tail -3` hiding a failure costs extra requests to recover
   it. Use the tool's own reporter: `vitest run --reporter=dot`, `tsc --noEmit`, `eslint` (its
   default reporter — `-f unix` is NOT available, the formatter was dropped from core ESLint and
   the flag fails after the full lint has already run), `pnpm -s`, `git --no-pager diff --stat`.
5. **Briefs are self-contained.** Paste the exact snippets needed; no "read first: A, B, C" lists.
6. **Use `LSP` for symbol questions** (where defined, who calls it, what implements this), not
   `Grep` + a whole-file `Read` — `findReferences`/`incomingCalls` replace "grep then read every
   hit", `workspaceSymbol` finds by name anywhere. Keep `Grep` for non-symbol text (strings,
   config keys, comments) and `Glob` for filenames. If `LSP` errors "Executable not found …
   typescript-language-server", run `mise install`. Reviewers review a **diff**, never the tree.
7. Use haiku for mechanical checks; opus/fable only where judgment matters, shortest leash.
8. Don't paste large file contents into reports; report paths + one-line facts.

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
