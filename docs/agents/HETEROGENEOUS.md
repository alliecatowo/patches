# Heterogeneous harness — DevPass + OpenCode

Durable principle: **smart models remove ambiguity; cheap models execute explicit work; durable repo state carries understanding forward; smart models return only when reality becomes ambiguous again.**

## Model ladder (all via `llmgateway/*` unless noted, all `standard` tier unless flagged PREMIUM)

| role                                    | model                        | effective limit | input / output / cache read                                    | cliff                           | when to use                                                                                                                                                                                                                                                                |
| --------------------------------------- | ---------------------------- | --------------- | -------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **goal-driver**                         | `gpt-5.6-luna`               | 250k            | $0.20 / $1.20 / $0.02 ≤272k → $0.40/$1.80 after (1.05M window) | 272k → $0.40/$1.80 whole-req    | **reasoning: medium** — persistent `/goal` entrypoint. Cheap, proven on coding plan (grok-4-1 2M not available). 150k→250k still under cliff, 67% more context. Fallback: `deepseek-v4-flash` 250k.                                                                        |
| **worker** (default, ~90% of tokens)    | `deepseek-v4-flash`          | 250k            | $0.05 / $0.10 / $0.014 (1.05M, 4× cheaper than luna)           | —                               | **reasoning: medium-low** — bounded low-ambiguity impl. 1M window, bumped 140k→250k. Fallback chain: `deepseek-v4-flash` → `opencode/muse-spark-1.2-contributor-free` → `opencode/nemotron-3-ultra-free` → `qwen3.7-flash` ($0.03, 1M). Exhaust free before paid retry.    |
| **mid-worker** (capability retry)       | `deepseek-v4-pro`            | 250k            | $0.43 / $0.87 / $0.014 (1.05M)                                 | —                               | **reasoning: medium** — stronger than flash, ~4× cheaper than terra. Bumped 140k→250k (1M window). Ladder `deepseek → free → pro/qwen → terra → grok`.                                                                                                                     |
| **researcher / docs-writer / verifier** | `qwen3.7-flash` / `deepseek` | 250k            | $0.03 / $0.13 / $0.006 (1M)                                    | —                               | **reasoning: low** — docs lookup, truthful docs, scoped checks. Bumped 120k→250k (1M window). Always `WebSearch/WebFetch` before guessing.                                                                                                                                 |
| **senior-worker / reviewer**            | `gpt-5.6-terra`              | 220k            | $2.00 / $12 / $0.20                                            | 272k → $4/$18                   | **reasoning: medium-high** — retry after leaf failure, integration, risky review. One retry, then replan or change approach. Only on `blocker=capability` after mid.                                                                                                       |
| **architect / auditor**                 | `grok-4-6`                   | 180k            | $2.00 / $6 / $0.50                                             | **200k → $4/$12 whole-request** | **reasoning: high** — design, ADRs, major decompositions, milestone audits. Fresh session per invocation. Cheaper fallbacks: `grok-4-3` (1M, $1.25/$2.50) or `gpt-5.6-terra` 220k when Grok not on coding plan.                                                            |
| **exceptional**                         | `gpt-5.6-sol` etc            | 250k            | $4-5 / $20-30 / $0.40                                          | 272k → $8/$30                   | **PREMIUM** (`$5+` in or `$15+` out) → burns weekly fair-use (Lite 12%, Pro 15%, Max 18%). Only on explicit `escalate: sol` or `ALLOW_PREMIUM=1`. Prefer `grok-4-6`/`terra` first — they're standard and cheaper. Non-premium fallback: `grok-4-6` → `terra` → `deepseek`. |

Why these ceilings: Grok-4.6/4.3 double at 200k, GPT-5.6 at 272k — the higher rate prices the _whole_ request. Driver now `gpt-5.6-luna` 250k (272k cliff, $0.20/$1.20 tier) — proven on coding plan; grok-4-1-fast 2M not available there, removed. Fork/compact at 175-180k (Grok) and ~250k (Luna/Terra/DeepSeek/Qwen) to stay below cliff while using 1M windows. DeepSeek peak is 01-04 + 06-10 UTC; off-peak is half — schedule batch work outside those 7h when possible.

**Free-model note:** `opencode/*-free` models cost $0 against DevPass credits. Use them as first retry to exhaust free capacity before paid models. They are weaker — don't route architecture through them.

## How `/goal` behaves

1. `/goal <objective>` creates a goal via `@prevalentware/opencode-goal-plugin` (see `opencode.json` + `.opencode/opencode.json` / `tui.json`). Subsequent `/goal` without args reports status; `/goal pause|resume|clear|history|edit` manage it.
2. Handler is `goal-driver` (`gpt-5.6-luna`). It reads `get_goal` + **board via `github` MCP** (`projects_list`/`projects_get` for GitHub issues preferred + drafts, `issue_read`/`search_issues` for issue bodies) + `roadmap.md` + spec checklists, infers `DISCOVERY / EXECUTION / AUDIT / REPLAN` from durable state, and delegates. `tasks.md` is archive/offline fallback only.
3. If planning incomplete → fresh `architect` packet → durable artifacts (board issues/drafts + ADRs + roadmap). Then execution resumes under driver — same `/goal` continues without re-paying for ideation.
4. Execution: ≤4 concurrent workers with disjoint file sets, bounded packets (`.opencode/skills/packet`), concise handoffs (`.opencode/skills/handoff`), `mise run check <ws>` via `bounded.sh`. No 40-worktree thrash, no `git worktree add` by hand. Board moves via `projects_write`/`issue_write` + `Fixes #N` merges (see `AGENTS.md:29`).

MCPs available to every agent: `github` (remote, `projects`+`issues` toolsets, needs `GITHUB_PAT`) and `mise` (stdio, `mise mcp`) — both declared in `opencode.json:4` + `.opencode/opencode.json:6` so they're repo-portable, plus any repo-level `.mcp.json` entries. Add a new MCP by adding a 5-line entry there; don't scatter per-agent configs.

## Packet / handoff

- **Packet** (`driver → worker`, ≤15 lines): task ID, objective, scope files, forbidden paths, acceptance, constraints, prior findings, validation, handoff shape, model. See `.opencode/skills/packet/SKILL.md`. No parent transcript copy.
- **Handoff** (`worker → driver`, ≤20 lines): status, summary, files, tests, findings, follow-ups (issue URLs), unresolved, blocker class (none/env/capability/semantic), confidence, next action. See `.opencode/skills/handoff/SKILL.md`.
- **Follow-up filing:** a worker files every concrete follow-up it discovers as a real GitHub issue (`gh issue create --repo alliecatowo/patches`), adds it to Project #5, and reports the URL in its handoff; scope/evidence/acceptance/blocked-by Task IDs/labels live in the issue body. Least privilege and secret safety still apply — no secrets in issues, one issue per follow-up, no edits to board items the worker didn't file. Driver confirms each filed issue's board Status and enqueues it.

## Escalation ladder

`deepseek → free → deepseek-pro/qwen (mid) → terra → grok` (→ `sol` only if `escalate: sol`). Env failures (port/DB/flock/inode) retry cheap, don't escalate. Capability failures → next rung once. Semantic failures → fresh `architect` replan with concise packet, not full dump. See `.opencode/skills/triage/SKILL.md`. Mid (`deepseek-v4-pro` $0.55/$1.80) is ~4× cheaper than terra ($2/$12) — burn it before terra.

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
