#!/usr/bin/env bash
# Enforce model allowlist + context-ceiling reminder. Runs as PreToolUse for Bash and as a lightweight check on model selection.
# This is the deterministic counterpart to agent prompt nudges — prompts can be ignored, this can't.
set -euo pipefail
input="$(cat)"
cmd="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write((j.tool_input&&j.tool_input.command)||JSON.stringify(j))}catch{}})' 2>/dev/null || true)"
[ -z "$cmd" ] && exit 0
block() { echo "BLOCKED by enforce-models.sh: $1" >&2; exit 2; }

# Block premium models unless explicitly escalated (sol/kimi-k3 are premium = weekly fair-use cap)
if printf '%s' "$cmd" | grep -Eq 'gpt-5\.6-sol|kimi-k3|claude-(opus|fable)'; then
  if ! printf '%s' "$cmd" | grep -Eq 'escalate.*sol|ALLOW_PREMIUM=1'; then
    block "premium model (sol/kimi-k3/claude-opus/fable) requires explicit escalation — use gpt-5.6-terra or grok-4-6 as standard-tier fallback (docs/agents/HETEROGENEOUS.md). Pass escalate: sol or ALLOW_PREMIUM=1 if truly needed."
  fi
fi
exit 0
