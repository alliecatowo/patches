# Context economy — where the tokens actually go

_Measured 2026-08-19 on the Phase 12–15 session (H-010). Re-measure with
`docs/agents/CONTEXT_ECONOMY.md`'s method after any harness change that claims a saving._

## The quantity to minimize

Every model turn re-reads that agent's entire context. So the bill is

```
cost ≈ Σ (context size at turn i)   over every turn of every agent
```

not "how many unique tokens did we read off disk". An agent that reads 100k of source and then
takes 30 more turns pays ~3M, not 100k. Because context only grows, **an agent's cost is roughly
quadratic in its lifetime**: halving how long an agent lives quarters what it costs.

This is why better retrieval, indexes, knowledge graphs and "preloading" barely move the number —
they change _what_ is in context, not _how many times it is re-read_.

## What we measured

One session, 147 subagents, 36,528 model turns total.

|                                          | cache read | share |
| ---------------------------------------- | ---------: | ----: |
| Orchestrator (main session, 1,646 turns) |      0.44B |  6.5% |
| Subagents (34,882 turns)                 |      6.35B | 93.5% |
| **Total**                                |  **6.80B** |       |

Against 13M output tokens — a **523:1** amplification, or ~323k cache-read tokens per tool call.

Breakdown of the subagent 6.43B (context-tokens per turn, summed):

| finding                                                                              |                              size |
| ------------------------------------------------------------------------------------ | --------------------------------: |
| Turns that issued **zero** tool calls (39% of turns — pure narration)                |                   **2.61B (40%)** |
| Tokens read **above** a 100k context (51% above 100k, 20% above 200k, 6% above 300k) |                   **3.30B (51%)** |
| Top 25 of 147 agents                                                                 | **55%** (top 12: 34%, top 5: 18%) |
| Fixed preamble (~24.7k median startup × 34,882 turns)                                |                   **0.86B (13%)** |

Tool calls per turn across the whole session: `{0 tools: 39%, 1 tool: 60%}` — **no turn anywhere
issued two tool calls.** The worst single agent ran 785 turns at a 340k mean context: 265M by
itself, more than the entire orchestrator.

By model: sonnet 5.99B, opus 0.43B, haiku 0.01B. Cost-weighted, opus is several times sonnet's
price per token, so it is a far larger share of the _money_ than of the token count — expensive
models need the shortest leashes, not just the hardest problems.

Of the ~24.7k median startup context, this repo's own preamble (CLAUDE.md + HARNESS.md + all
rules + the agent prompt) is only ~6k; the rest is the system prompt and tool schemas. Trimming
our markdown is therefore a small lever; the tool surface handed to each agent is the bigger one.

## What follows from it

Ranked by measured size, and reflected in `HARNESS.md`'s token-discipline rules and the agent
prompts:

1. **Act, don't narrate** (40%). A sentence of prose between two tool calls costs a full context
   re-read. No "now I'll check X" turns, no mid-task progress summaries, no re-reading a file to
   confirm an `Edit` applied.
2. **Batch independent calls into one turn** (same 40% pool). Reads that don't depend on each
   other, edits already decided, and one chained verify command instead of four.
3. **Cap lifetime, then hand off** (51%). At ~40 turns or ~120k context an agent writes a compact
   handoff (done / left / owned paths / next step) and stops; a fresh agent continues from the
   packet. Three short agents beat one marathon — this reverses earlier guidance.
4. **Right-size output at the source, never blind-truncate** (turn multiplier). `| tail -3` that
   hides the failing test costs two extra turns (~250k each) to recover 3k of text. Use the
   tool's own reporter: `vitest run --reporter=dot`, `tsc --noEmit`, `eslint -f unix`, `pnpm -s`,
   `git --no-pager diff --stat`. Hooks may strip things that lose nothing (ANSI, pnpm banners);
   they must not swallow diagnostics, because recovering them costs more than they saved.
5. **Keep reports short** (orchestrator tail). Every agent report stays in the orchestrator's
   context for the rest of the session and is re-read on every subsequent turn.

### Deliberately rejected

- **Validation hooks that replace test output with PASS/FAIL.** The information you dropped is
  exactly what the next decision needs, so the agent re-runs the command wider — two fat turns to
  save one thin one. Same failure mode as over-tight `tail`.
- **A bespoke "context compiler" / symbol-level patch protocol.** Real savings in theory, but it
  replaces the agent's judgement with a guess about what it will need, and every miss costs a
  turn. Revisit only if rules 1–3 stop paying.
- **A dumber orchestrator.** It is 6.5% of spend and it is what decides which work exists.

### Open experiment

`H-011` — a sonnet agent whose only tool is `Agent`, delegating read/edit/verify waves to haiku
sub-agents, so the read/edit churn accumulates in the cheapest context while the expensive one
stays thin. Worth measuring against this baseline before adopting.

## Method (reproduce it)

Per-request usage lives in the transcripts: the main session at
`~/.claude/projects/<project>/<session-id>.jsonl`, each subagent at
`/tmp/claude-*/<project>/<session-id>/tasks/<agent-id>.output`. Both are JSONL where an assistant
entry carries `message.usage` with `input_tokens`, `cache_read_input_tokens`,
`cache_creation_input_tokens`, `output_tokens`, and `message.content[]` whose `type: "tool_use"`
blocks give the tool-call count for that turn. Context size at a turn is the sum of the three
input counters. Sum per file for per-agent totals; histogram `tool_use` counts per entry for the
batching figure; sum `max(0, ctx - cap)` for the "read above a cap" figures.
