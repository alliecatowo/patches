#!/usr/bin/env bash
# SessionStart: surface the task archive so every session starts oriented. The live board is the
# GitHub Project (https://github.com/users/alliecatowo/projects/5) — query it via the `github` MCP
# server (projects_list/projects_get); this hook stays offline/instant so it only reads the archive.
set -uo pipefail
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
echo "Live board: https://github.com/users/alliecatowo/projects/5 (query via github MCP projects_list/projects_get)"
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
