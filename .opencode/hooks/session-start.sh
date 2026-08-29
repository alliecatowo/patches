#!/usr/bin/env bash
# SessionStart: surface the task archive + heterogeneous routing so every session starts oriented.
set -uo pipefail
root="${OPENCODE_PROJECT_DIR:-$(pwd)}"
echo "Live board: https://github.com/users/alliecatowo/projects/5 (query via github MCP projects_list/projects_get)"
echo "Heterogeneous harness: docs/agents/HETEROGENEOUS.md — goal-driver (luna 90k) → worker (deepseek 140k) → senior (terra 220k) → architect (grok 180k). Use WebSearch/WebFetch against official docs before guessing (pricing/API limits change monthly)."
echo "Packet→Handoff: .opencode/skills/packet/SKILL.md + .opencode/skills/handoff/SKILL.md — keep contexts small, fan out ≤4 workers with disjoint paths."
if [ -f "$root/tasks.md" ]; then
  open="$(grep -c '^- \[ \]' "$root/tasks.md" 2>/dev/null || echo 0)"
  done_="$(grep -c '^- \[x\]' "$root/tasks.md" 2>/dev/null || echo 0)"
  echo "tasks.md (archive/offline fallback, not ticked live): $open open / $done_ done. Sample open archive entries:"
  grep -m 5 '^- \[ \]' "$root/tasks.md" || true
fi
# A bare 'node' that isn't the mise-pinned version breaks Vitest's jsdom localStorage shadowing in confusing, app-looking ways (cost an agent a full turn budget 2026-08-19) — warn loudly.
pinned="$(grep -m1 '^node[[:space:]]*=' "$root/mise.toml" 2>/dev/null | sed 's/.*"\(.*\)".*/\1/')"
actual="$(node --version 2>/dev/null | sed 's/^v//')"
if [ -n "$pinned" ] && [ -n "$actual" ] && [ "$pinned" != "$actual" ]; then
  echo "WARNING: bare 'node' is $actual but mise.toml pins $pinned. Run commands as 'mise exec -- <cmd>'."
fi
exit 0
