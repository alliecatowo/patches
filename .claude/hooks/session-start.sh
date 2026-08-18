#!/usr/bin/env bash
# SessionStart: surface the task board so every session starts oriented.
set -uo pipefail
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
if [ -f "$root/tasks.md" ]; then
  open="$(grep -c '^- \[ \]' "$root/tasks.md" 2>/dev/null || echo 0)"
  done_="$(grep -c '^- \[x\]' "$root/tasks.md" 2>/dev/null || echo 0)"
  echo "tasks.md: $open open / $done_ done. Next open tasks:"
  grep -m 8 '^- \[ \]' "$root/tasks.md" || true
  echo "Use /task to manage the board, /verify before committing, /retro to record learnings."
fi
if [ -f "$root/docs/agents/LEARNINGS.md" ]; then
  n="$(grep -c '^## ' "$root/docs/agents/LEARNINGS.md" 2>/dev/null || echo 0)"
  echo "docs/agents/LEARNINGS.md has $n entries — skim the newest before starting."
fi
exit 0
