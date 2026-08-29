# Heterogeneous harness — DevPass + OpenCode

Durable principle: **smart models remove ambiguity; cheap models execute explicit work; durable repo state carries understanding forward; smart models return only when reality becomes ambiguous again.**

## Model ladder (all via `llmgateway/*` unless noted, all `standard` tier unless flagged PREMIUM)

| role                                    | model                        | effective limit | input / output / cache read                                              | cliff                            | when to use                                                                                                                                                                                                                                                                |
| --------------------------------------- | ---------------------------- | --------------- | ------------------------------------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **goal-driver**                         | `gpt-5.6-luna`               | 90k             | $0.20 / $1.20 / $0.02                                                    | 272k → $0.40/$1.80 whole-request | Persistent `/goal` entrypoint after planning exists. Boring routing. Never does ticket impl.                                                                                                                                                                               |
| **worker** (default, ~90% of tokens)    | `deepseek-v4-flash`          | 140k            | $0.22 off-peak / $0.44 peak in, $0.66/$1.32 out, $0.007/$0.014 cache hit | —                                | Bounded low-ambiguity impl. Fallback chain: `deepseek-v4-flash` → `opencode/muse-spark-1.2-contributor-free` → `opencode/nemotron-3-ultra-free` → `qwen3.7-flash` ($0.03). Exhaust free before paid retry.                                                                 |
| **researcher / docs-writer / verifier** | `qwen3.7-flash` / `deepseek` | 120k            | $0.03 / $0.13 / $0.006                                                   | —                                | Docs lookup, truthful docs, scoped checks. Always `WebSearch/WebFetch` before guessing.                                                                                                                                                                                    |
| **senior-worker / reviewer**            | `gpt-5.6-terra`              | 220k            | $2.00 / $12 / $0.20                                                      | 272k → $4/$18                    | Retry after leaf failure, integration, risky review. One retry, then replan or change approach. Stronger than worker as required.                                                                                                                                          |
| **architect / auditor**                 | `grok-4-6`                   | 180k            | $2.00 / $6 / $0.50                                                       | **200k → $4/$12 whole-request**  | Design, ADRs, major decompositions, milestone audits. Fresh session per invocation. Cheaper fallbacks: `grok-4-3` (1M, $1.25/$2.50) or `grok-4-1-fast-reasoning` ($0.20/$0.50, 2M) when 1M-doc or cost matters.                                                            |
| **exceptional**                         | `gpt-5.6-sol` etc            | 250k            | $4-5 / $20-30 / $0.40                                                    | 272k → $8/$30                    | **PREMIUM** (`$5+` in or `$15+` out) → burns weekly fair-use (Lite 12%, Pro 15%, Max 18%). Only on explicit `escalate: sol` or `ALLOW_PREMIUM=1`. Prefer `grok-4-6`/`terra` first — they're standard and cheaper. Non-premium fallback: `grok-4-6` → `terra` → `deepseek`. |

Why these ceilings: Grok doubles at 200k, GPT-5.6 at 272k — the higher rate prices the _whole_ request. Fork/compact at 175-180k (Grok) and ~90k/220k (Luna/Terra) to stay below. DeepSeek peak is 01-04 + 06-10 UTC; off-peak is half — schedule batch work outside those 7h when possible.

**Free-model note:** `opencode/*-free` models cost $0 against DevPass credits. Use them as first retry to exhaust free capacity before paid models. They are weaker — don't route architecture through them.

## How `/goal` behaves

1. `/goal <objective>` creates a goal via `@prevalentware/opencode-goal-plugin` (see `opencode.json` + `.opencode/opencode.json` / `tui.json`). Subsequent `/goal` without args reports status; `/goal pause|resume|clear|history|edit` manage it.
2. Handler is `goal-driver` (`gpt-5.6-luna`). It reads `get_goal` + board (`projects_list`) + `roadmap.md` + spec checklists, infers `DISCOVERY / EXECUTION / AUDIT / REPLAN` from durable state, and delegates.
3. If planning incomplete → fresh `architect` packet → durable artifacts (board items, ADRs, roadmap). Then execution resumes under driver — same `/goal` continues without re-paying for ideation.
4. Execution: ≤4 concurrent workers with disjoint file sets, bounded packets (`.opencode/skills/packet`), concise handoffs (`.opencode/skills/handoff`), `mise run check <ws>` via `bounded.sh`. No 40-worktree thrash, no `git worktree add` by hand.

## Packet / handoff

- **Packet** (`driver → worker`, ≤15 lines): task ID, objective, scope files, forbidden paths, acceptance, constraints, prior findings, validation, handoff shape, model. See `.opencode/skills/packet/SKILL.md`. No parent transcript copy.
- **Handoff** (`worker → driver`, ≤20 lines): status, summary, files, tests, findings, unresolved, blocker class (none/env/capability/semantic), confidence, next action. See `.opencode/skills/handoff/SKILL.md`.

## Escalation ladder

`deepseek → free → terra → grok` (→ `sol` only if `escalate: sol`). Env failures (port/DB/flock/inode) retry cheap, don't escalate. Capability failures → next rung once. Semantic failures → fresh `architect` replan with concise packet, not full dump. See `.opencode/skills/triage/SKILL.md`.

## Context economics

Ceilings in `opencode.json` `provider.llmgateway.models[].limit.context` make compaction deterministic — otherwise `overflow.ts` sees `context==0` and never compacts. Driver stays small by forking fresh architect/auditor sessions; workers terminate after handoff instead of accumulating immortal context. Stable instruction prefixes preserve cache (`docs/agents/CONTEXT_ECONOMY.md`).

## Files to tune

- `opencode.json` — ceilings + free fallbacks
- `.opencode/agents/*.md` — per-agent `model:` pins (OpenCode primary)
- `.claude/agents/*.md` — compat aliases (no Anthropic names; they now point at same `llmgateway/*`)
- `.opencode/hooks/guard-bash.sh` + `enforce-models.sh` — deterministic blocks
- `.opencode/skills/packet|handoff|triage` — packet shapes
- `~/.config/opencode/opencode.jsonc` — DevPass key + `llmgateway` provider (don't commit keys)

To swap models: change `model:` in the agent file and `limit.context` in `opencode.json` to match the pricing cliff for that model (check `llmgateway.io/models` + `x.ai/docs` + `openai.com` live — use `WebSearch` before hardcoding).

## Validation

`opencode debug config` should list 5+ agents with `llmgateway/*` and the limits above. No `claude-*`/`anthropic` should be selectable. Packet flows: `goal-driver` → `worker` with bounded packet → ≤20-line handoff → driver triage. See `docs/agents/CONTEXT_ECONOMY.md` for measurement (`mise run usage`).

## Claude Code compat

Claude Code still works as UI but no Anthropic inference occurs — `.claude/settings.json` pins `CLAUDE_CODE_AUTO_COMPACT_WINDOW=180k` and routes via `ANTHROPIC_BASE_URL=https://api.llmgateway.io/v1`; `guard-bash.sh` blocks `ANTHROPIC_API_KEY`/`claude-*` strings. Prefer OpenCode for new delegation.
