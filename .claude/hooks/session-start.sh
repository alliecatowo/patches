#!/usr/bin/env bash
# SessionStart: surface the task board so every session starts oriented.
set -uo pipefail
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
if [ -f "$root/tasks.md" ]; then
  open="$(grep -c '^- \[ \]' "$root/tasks.md" 2>/dev/null || echo 0)"
  done_="$(grep -c '^- \[x\]' "$root/tasks.md" 2>/dev/null || echo 0)"
  echo "tasks.md: $open open / $done_ done. Next open tasks:"
  grep -m 5 '^- \[ \]' "$root/tasks.md" || true
fi
# A bare 'node' that isn't the mise-pinned version breaks Vitest's jsdom localStorage shadowing in confusing, app-looking ways (cost an agent a full turn budget 2026-08-19) — warn loudly.
pinned="$(grep -m1 '^node[[:space:]]*=' "$root/mise.toml" 2>/dev/null | sed 's/.*"\(.*\)".*/\1/')"
actual="$(node --version 2>/dev/null | sed 's/^v//')"
if [ -n "$pinned" ] && [ -n "$actual" ] && [ "$pinned" != "$actual" ]; then
  echo "WARNING: bare 'node' is $actual but mise.toml pins $pinned. Run commands as 'mise exec -- <cmd>'."
fi
exit 0
