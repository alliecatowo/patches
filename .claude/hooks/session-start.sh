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
# Fail loudly when the bare `node` on PATH isn't the pinned one. A mismatch does not just print
# an engines warning — Node 26 defines an experimental global `localStorage` that returns
# undefined, Vitest 4's jsdom environment won't shadow a global key it doesn't know about, and
# every test importing a module that touches storage at import time crashes with a bug that looks
# like an app bug. Cost an agent most of its turn budget on 2026-08-19 before it caught it.
pinned="$(grep -m1 '^node[[:space:]]*=' "$root/mise.toml" 2>/dev/null | sed 's/.*"\(.*\)".*/\1/')"
actual="$(node --version 2>/dev/null | sed 's/^v//')"
if [ -n "$pinned" ] && [ -n "$actual" ] && [ "$pinned" != "$actual" ]; then
  echo "WARNING: bare 'node' is $actual but mise.toml pins $pinned."
  echo "  Run commands as 'mise exec -- <cmd>', or put mise's activation after brew/nvm in your shell profile."
  echo "  Symptom if you don't: web tests crash in window.localStorage with what looks like an app bug."
fi
if [ -f "$root/docs/agents/LEARNINGS.md" ]; then
  n="$(grep -c '^## ' "$root/docs/agents/LEARNINGS.md" 2>/dev/null || echo 0)"
  echo "docs/agents/LEARNINGS.md has $n entries — skim the newest before starting."
fi
exit 0
