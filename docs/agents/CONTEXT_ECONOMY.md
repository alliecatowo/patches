# Context economy — where the tokens actually go

_Measured 2026-08-19, all sessions, via `mise run usage`. Re-measure with this file's method after any harness change that claims a saving — read "The double-count trap" first if you're about to write the measurement script._

## The quantity to minimize

Every model turn re-reads that agent's entire context, so the bill is

```
cost ≈ Σ (context size at request i)   over every API request of every agent
```

Not "how many unique tokens did we read off disk" — an agent that reads 100k and takes 30 more requests pays ~3M, not 100k. Cost is roughly quadratic in an agent's lifetime; better retrieval or "preloading" barely moves the number since it changes _what's_ in context, not _how often it's re-read_.

## The double-count trap

Claude Code writes one API request as several JSONL lines (a `thinking` line, then one or more `tool_use` lines), each repeating the identical `message.usage` object. Summing `usage` per **line** instead of per **`message.id`** inflated every total ~40% and invented a fake population of "zero-tool turns." Fix: group by `message.id` first — tool-call count is `tool_use` blocks summed across all lines sharing one id. Also walk the whole tree (`~/.claude/projects/<slug>/**` + every subagent `.output` under `$TMPDIR/claude-<uid>/<slug>/`), not one session — that's how the true 7.62B cache-read total first showed as 3.92B. `infra/scripts/usage-report.mjs` (`mise run usage`) does both; don't re-derive a script.

## What we measured (corrected)

|                             |                        value |
| --------------------------- | ---------------------------: |
| Cache reads (total)         |                        7.62B |
| — orchestrator / subagent   |                    53% / 47% |
| Tool calls per request      |                         1.13 |
| No-tool requests            | 1% of requests, 1% of tokens |
| Tokens read above 100k/200k |                    53% / 22% |

Subagent workers: 196k mean context over 18,676 requests; the worst 5 individual contexts alone total 686M tokens (156.6M/444 reqs, 152.2M/427, 142.2M/492, 139.0M/500, 96.5M/300) — one of them a third of the orchestrator's entire share on some sessions. Lifetime/context size is the dominant lever, not narration: the old "~40% narration" figure was the double-count bug; retired.

## Ranked levers

1. **Cap worker lifetime / keep briefs scoped — dominant (53%/22% of tokens above 100k/200k).** Hand off at ~40 turns / ~120k context with a compact packet (done/left/owned paths/next step); `maxTurns` is a backstop, not the target. Workers only — the orchestrator may run long.
2. **Batch independent calls into one request — a real ~2x lever.** 1.13 tool calls/request means most requests do one thing when they could do two or three. Target > 1.5.
3. **Narration is not a real problem.** Only 1% of requests call no tool — don't re-prioritize around the retired 40% figure.
4. **Right-size output at the source, never blind-truncate.** Use the tool's own reporter (`vitest --reporter=dot`, `tsc --noEmit`, `pnpm -s`, `git --no-pager diff --stat`) instead of `| tail -3`, which hides a failure you'll pay extra requests to recover.
5. **Keep reports short** — every agent report stays in the orchestrator's context for the rest of the session and is re-read on every subsequent request.

### Deliberately rejected

- **Validation hooks replacing test output with PASS/FAIL** — the dropped detail is exactly what the next decision needs; the agent re-runs wider, costing more than it saved.
- **A bespoke "context compiler" / symbol-level patch protocol** — replaces judgment with a guess about what's needed; `LSP` gets most of the same benefit for read paths without that risk.
- **A dumber orchestrator / orchestrator turn caps** — one long-lived context deciding what work exists; capping it just forces expensive re-briefing.

## Enforced by configuration

- **`opencode.json` `provider.llmgateway.models[].limit.context`**: deterministic ceilings — `grok-4-6`/`grok-4-3` 180k (200k cliff doubles whole request), `gpt-5.6-luna` 90k, `gpt-5.6-terra` 220k (272k cliff), `deepseek-v4-flash` 140k, `qwen3.7-flash` 120k, free `opencode/*-free` 120-140k. If `limit` is unset or 0, `overflow.ts` never compacts — that's the bug `oh-my-openagent#4184` documents. These ceilings are the fork/compact trigger, not just hints.
- **`maxTurns`** on every agent: 100 (`verifier` 40) — runaway backstop, not target; `goal-driver` 150 for the long-lived driver.
- **`disallowedTools: mcp__*`** on every agent that doesn't need it — keeps tool-schema preamble small.
- **`CLAUDE_CODE_AUTO_COMPACT_WINDOW=180000`** in `.claude/settings.json` (was 500k) + `goal-driver` 90k / `deepseek` 140k / `grok` 180k via `opencode.json` — stays below the 200k Grok and 272k GPT cliffs where pricing doubles for the whole request.
- **`LSP`** on read-heavy agents — tens of tokens vs whole-file `Read`.
- **Harness guards**: `max 4 concurrent workers` (see `HETEROGENEOUS.md`), `guard-bash.sh` blocks `git worktree add` by hand and `>6 worktrees` (inode/cache thrash, `LEARNINGS.md` 2026-08-20), `bounded.sh` throttles `check`/`build` across workers.

## Method (reproduce it)

Main session transcript: `~/.claude/projects/<project>/<session-id>.jsonl`; each subagent: `/tmp/claude-*/<project>/<session-id>/tasks/<agent-id>.output`. Both JSONL, `message.id` + `message.usage` + `message.content[]` `tool_use` blocks. Group by `message.id` first, sum per file for per-agent totals, histogram tool-call counts for the batching figure, sum `max(0, ctx - cap)` for the "above a cap" figures — `infra/scripts/usage-report.mjs` (`mise run usage`) implements this.
