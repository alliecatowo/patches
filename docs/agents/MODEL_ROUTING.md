# Model routing — route by remaining ambiguity, not size

All inference via DevPass `llmgateway/*` or `opencode/*-free`; no Anthropic. Use `WebSearch/WebFetch` against official docs before guessing — pricing and cliffs change monthly. See `docs/agents/HETEROGENEOUS.md` for the full ladder + pricing table and `opencode.json` for effective context ceilings.

| Remaining ambiguity                                                     | Model (OpenCode agent)                                                                             | Effective limit                                   | Guard                                                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| Search, classification, mechanical edit, narrow diagnostic              | `qwen3.7-flash` 120k or `muse-spark-1.2-free` / `deepseek-v4-flash` 140k (`researcher`/`verifier`) | 120-140k, standard, cheapest                      | Exact paths + stop condition                                             |
| Bounded implementation, tests, docs, localized bug fix                  | `deepseek-v4-flash` 140k (`worker`/`implementer`) fallback `opencode/*-free` → `qwen3.7-flash`     | 140k, $0.22 off-peak in, 1M window, standard      | Disjoint ownership, `mise run check <ws>` scoped                         |
| Integration across subsystems, retry after leaf failure, routine review | `gpt-5.6-terra` 220k (`senior-worker`/`reviewer`)                                                  | 220k, $2/$12, 272k cliff                          | Stronger than implementer (deepseek → terra); don't use `sol` by default |
| Architecture, major decomposition, milestone audit, spec contradiction  | `grok-4-6` 180k (`architect`/`milestone-auditor`) fallback `grok-4-3` 180k / `grok-4-1-fast` 160k  | 180k, $2/$6, **200k cliff doubles whole request** | Fresh session, concise packet, ADR if needed                             |

Exceptional escalation (`gpt-5.6-sol` 250k, `kimi-k3`, `claude-opus*`) is **PREMIUM** (`$5+` in or `$15+` out) → weekly fair-use cap (Lite 12%, Pro 15%, Max 18% of credits; see `HETEROGENEOUS.md`). Only on explicit `escalate: sol` or `ALLOW_PREMIUM=1`. Prefer `grok-4-6`/`terra` — they're standard and cheaper. Free-model retry (`opencode/*-free`) comes before paid escalation.

Packets: `.opencode/skills/packet/SKILL.md` (≤15 lines, no transcript copy). Handoffs: `.opencode/skills/handoff/SKILL.md` (≤20 lines). Workers start fresh, inspect the repo themselves, and terminate after handoff. Max 4 concurrent workers with disjoint paths.

Independent review must be stronger than implementation: `deepseek → terra`, `terra → grok`. `verifier` runs `mise run check <ws>` (bounded, scoped); implementer fixes failures. After two identical failures, change approach or replan via `triage` skill — don't retry unchanged. No routing choice authorizes guessed tasks, scope expansion, or hard-rule deviation.
