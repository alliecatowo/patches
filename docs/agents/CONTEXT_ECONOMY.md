# Context economy — where the tokens actually go

_Measured 2026-08-19, all sessions, via `mise run usage` (H-010/H-011). Re-measure with this
file's method after any harness change that claims a saving — and read "The double-count trap"
below first if you're about to write the measurement script._

## The quantity to minimize

Every model turn re-reads that agent's entire context. So the bill is

```
cost ≈ Σ (context size at request i)   over every API request of every agent
```

not "how many unique tokens did we read off disk". An agent that reads 100k of source and then
takes 30 more requests pays ~3M, not 100k. Because context only grows, **an agent's cost is
roughly quadratic in its lifetime**: halving how long an agent lives quarters what it costs.

This is why better retrieval, indexes, knowledge graphs and "preloading" barely move the number —
they change _what_ is in context, not _how many times it is re-read_.

## The double-count trap

Claude Code writes **one API request as several JSONL lines** in the transcript (a `thinking`
line, then one or more `tool_use` lines, …), and every line in that group repeats the _identical_
`message.usage` object. The first version of this measurement summed `usage` per **line**, which
inflated every total by ~40% and invented a large fake population of "zero-tool turns" — those
were really the thinking half of a request that _did_ call a tool, double-counted as if it were a
separate contextless turn.

**Fix: group by `message.id` before summing.** One `message.id` = one real API request = one
`usage` charge, no matter how many JSONL lines or tool_use blocks it produced. `tool calls per
request` is the count of `tool_use` blocks across all lines sharing a `message.id`, not per line.

Also cross-session, not single-session: `mise run usage` walks every session under
`~/.claude/projects/<slug>/` **and** every subagent `.output` file under
`$TMPDIR/claude-<uid>/<slug>/`. Globbing just the current session's `.jsonl` undercounts badly —
that's how the true 7.62B cache-read total first showed up as 3.92B before the walk was widened.
`infra/scripts/usage-report.mjs` does both (message.id grouping + full-tree walk); use it, don't
re-derive a script from scratch.

## What we measured (corrected)

All sessions, `mise run usage`, 2026-08-19:

|                              |                        value |
| ---------------------------- | ---------------------------: |
| Cache reads (total)          |                        7.62B |
| — orchestrator share         |                          53% |
| — subagent share             |                          47% |
| Output tokens                |                         5.7M |
| Amplification                |                     1347 : 1 |
| API requests                 |                       38,852 |
| Contexts (sessions + agents) |                          314 |
| Tool calls per request       |                         1.13 |
| No-tool requests             | 1% of requests, 1% of tokens |
| Tokens read above 100k ctx   |                          53% |
| Tokens read above 200k ctx   |                          22% |

Subagent workers specifically: 196k mean context over 18,676 requests, 53% of tokens above a
100k context, 22% above 200k. The worst 5 individual subagent contexts (cache read / requests /
mean context):

```
156.6M / 444 / 354k
152.2M / 427 / 359k
142.2M / 492 / 290k
139.0M / 500 / 279k
 96.5M / 300 / 323k
```

Five contexts, 686M tokens — a single one of them (157M) is more than a third of the
orchestrator's entire share on some sessions. This is the #1 lever: **lifetime/context size**, not
narration.

Narration (zero-tool requests) is genuinely small: 1% of requests, 1% of tokens. It was reported
as ~40% before the double-count fix; that figure is retired. Keep discouraging it (it's still
free to avoid) but it is not worth ranking above lifetime or batching.

Batching remains real: 1.13 tool calls per request means the overwhelming majority of requests do
exactly one thing. There is real headroom above 1.13 — target > 1.5 by combining independent
reads/edits/verify steps into one request.

## What follows from it (ranked by the corrected data)

1. **Cap worker lifetime / context size — the dominant lever (53% of tokens above 100k, 22%
   above 200k).** A worker running 444 requests at a 354k mean context burns 157M by itself. Hand
   a subagent off at ~40 turns / ~120k context; `maxTurns` in each agent's frontmatter enforces
   this mechanically, and hitting the cap and returning a partial result to the orchestrator IS
   the handoff, not a failure. **This clamp applies to workers (subagents) only** — the
   orchestrator (main session) is explicitly allowed a long-running context; deciding what work
   exists is its job, and re-briefing it from scratch costs more than letting it run. Do not add
   orchestrator turn caps.
2. **Batch independent calls into one request — a real ~2x lever.** 1.13 tool calls/request means
   most requests do one thing when they could do two or three. Every independent read goes in the
   same request; every already-decided edit goes in the same request; one chained verify command
   per package instead of four separate ones. Target > 1.5 tool calls/request.
3. **Narration is not a real problem.** Only 1% of requests call no tool at all. Keep one line of
   guidance so nobody "rediscovers" the old inflated 40% figure and re-prioritizes around it.
4. **Right-size output at the source, never blind-truncate.** `| tail -3` that hides a failing
   test costs extra requests to recover a few KB of output — use the tool's own reporter instead:
   `vitest run --reporter=dot`, `tsc --noEmit` (already errors-only), `eslint` with its default
   reporter, `pnpm -s`, `git --no-pager diff --stat`. Not `eslint -f unix`: the unix formatter was
   removed from core ESLint, so the flag errors out _after_ paying for the whole 42s lint run.
5. **Keep reports short.** Every agent report stays in the orchestrator's context for the rest of
   the session and is re-read on every subsequent request.

### Deliberately rejected

- **Validation hooks that replace test output with PASS/FAIL.** The information you dropped is
  exactly what the next decision needs, so the agent re-runs the command wider — two fat requests
  to save one thin one. Same failure mode as over-tight `tail`.
- **A bespoke "context compiler" / symbol-level patch protocol.** Real savings in theory, but it
  replaces the agent's judgement with a guess about what it will need, and every miss costs a
  request. Symbolic search via the `LSP` tool (see `HARNESS.md`) gets most of this benefit for
  read paths without that risk — reach for that before inventing anything bespoke.
- **A dumber orchestrator / orchestrator turn caps.** The orchestrator is 53% of spend by volume
  but it is one long-lived context deciding what work exists across the whole session, not a
  worker doing bounded task; capping it just forces expensive re-briefing.

## Enforced by configuration

Prose alone didn't hold before, so the top findings above are backstopped mechanically:

- **`maxTurns`** in every `.claude/agents/*.md` frontmatter (12–40, sized to role: `verifier` 12,
  `researcher`/`reviewer`/`docs-writer`/`harness-tuner` 20, `architect` 30, `spec-auditor` 35,
  `implementer` 40) — a hard backstop against a runaway worker, not a target. Each agent's body
  says what a handoff at the cap must contain (done / left / owned paths / next step) so hitting
  it is a graceful stop, not a truncation.
- **`disallowedTools: mcp__*`** on every agent — none use MCP; this keeps the tool-schema portion
  of the fixed preamble from growing as MCP servers are added later.
- **`CLAUDE_CODE_AUTO_COMPACT_WINDOW=100000`** in `.claude/settings.json`'s `env` block, targeting
  the "tokens read above 100k context" finding directly — the `env` form is used instead of a
  top-level `autoCompactWindow` key because it's a documented, stable knob regardless of the exact
  settings schema this repo's `$schema` validates against, so a typo here can't silently break
  session startup.
- **`.claude/hooks/trim-output.sh`** (`PostToolUse`/`Bash`) strips ANSI escapes, pnpm/turbo
  lifecycle banners, and repeated `[WARN] Unsupported engine` lines, and collapses long blank-line
  runs — lossless only, fails open on any error. It does not touch diagnostics (test failures,
  error output), per the "never blind-truncate" rule above; verified by diffing real captured
  `pnpm test` output before/after.
- **`LSP` tool** on read-heavy agents (`implementer`, `reviewer`, `architect`, `spec-auditor`,
  `docs-writer`) — symbolic lookups (`findReferences`, `goToDefinition`, `workspaceSymbol`, …)
  return tens to low-hundreds of tokens instead of a `Grep` hit list plus a whole multi-hundred-
  line file `Read`. See `HARNESS.md`'s "Symbolic search" section. Directly attacks lever #1 by
  keeping read-path context small in the first place, not just capping it after the fact.

### Open experiment

`H-011` — a sonnet agent whose only tool is `Agent`, delegating read/edit/verify waves to haiku
sub-agents, so the read/edit churn accumulates in the cheapest context while the expensive one
stays thin. Worth measuring against this baseline before adopting.

## Method (reproduce it)

Per-request usage lives in the transcripts: the main session at
`~/.claude/projects/<project>/<session-id>.jsonl`, each subagent at
`/tmp/claude-*/<project>/<session-id>/tasks/<agent-id>.output` (or under `$TMPDIR` if set). Both
are JSONL where an assistant entry carries `message.id`, `message.usage` with `input_tokens`,
`cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`, and
`message.content[]` whose `type: "tool_use"` blocks give the tool-call count for that line.

**Group by `message.id` first** (see "The double-count trap" above) — take one `usage` value per
unique `message.id`, and sum `tool_use` block counts across all lines sharing that id. Then sum
per file for per-agent totals; histogram tool-call counts per request for the batching figure;
sum `max(0, ctx - cap)` for the "read above a cap" figures. `infra/scripts/usage-report.mjs`
(`mise run usage`) implements this and walks every session + subagent output tree, not just the
current session.
