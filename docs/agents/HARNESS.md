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

Every model turn re-reads the agent's whole context, so **cost ≈ Σ(context size) over turns** —
not "tokens read from disk". Measured on the 2026-08-19 session (6.8B cache reads; method and
full numbers in `docs/agents/CONTEXT_ECONOMY.md`): subagents were 93% of it, 40% went to turns
that called **no tool at all**, 51% was read above a 100k context, and the top 25 of 147 agents
were 55% of the spend. The rules below are ranked by that measurement.

1. **Act, don't narrate.** 39% of subagent turns issued zero tool calls — pure prose between
   actions, each costing a full context re-read. Think, then act. Never announce what you are
   about to do as its own turn, never re-read a file to confirm an `Edit` applied (the tool
   errors if it didn't), never summarize progress mid-task.
2. **Batch every independent call into one turn.** The same session issued **zero** turns with
   more than one tool call. Reads that don't depend on each other go in one turn; edits you have
   already decided go in one turn. One combined verify command per package
   (`pnpm --filter X build && … typecheck && … test`), not four turns.
3. **Stay small, then hand off.** Cost is ~quadratic in an agent's lifetime. At roughly 40 turns
   or 120k context, stop: write a compact handoff (done / left / owned paths / next concrete
   step) and return it. The orchestrator re-briefs a fresh agent from that packet. Three short
   agents beat one marathon — this reverses the old "prefer one well-briefed agent" advice,
   which the measurement disproved.
4. **Make commands emit the right thing; never blind-truncate.** `| tail -3` that hides the
   failing test costs two more turns (~250k each here) to recover 3k of output. Use the tool's
   own reporter instead: `vitest run --reporter=dot`, `tsc --noEmit` (already errors-only),
   `eslint -f unix`, `pnpm -s`, `git --no-pager diff --stat`.
5. **Briefs are self-contained.** The orchestrator pastes the exact snippets the agent needs
   (signatures, entity fields, proto shapes, paths, the verify command); agents start
   implementing on turn 1. No "read first: A, B, C" lists. Research docs and the spec are
   reference, not required reading.
6. No exploratory repo tours: `Grep` for a symbol, read the one file, act. Reviewers review a
   **diff** (`git diff <base>..HEAD -- <paths>`), never the whole tree.
7. Use haiku for mechanical checks; opus/fable only where judgment matters — and keep their
   leashes shortest, since their context costs several times sonnet's per token.
8. Don't paste large file contents into reports; report paths + one-line facts. Every report you
   return sits in the orchestrator's context for the rest of the session.

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
