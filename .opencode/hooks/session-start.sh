#!/usr/bin/env bash
# SessionStart: surface bounded worker-packet guidance. Do not emit archive contents.
set -uo pipefail
root="${OPENCODE_PROJECT_DIR:-$(pwd)}"
echo "Live board: https://github.com/users/alliecatowo/projects/5 (query via github MCP projects_list/projects_get)"
echo "Worker context contract: scripts/worker-context.mjs — issue, changed files, workpad, exact checks, targeted commands; no transcript replay."
echo "Heterogeneous harness: docs/agents/HETEROGENEOUS.md — use fresh bounded packets and concise handoffs."
# A bare 'node' that isn't the mise-pinned version breaks Vitest's jsdom localStorage shadowing in confusing, app-looking ways (cost an agent a full turn budget 2026-08-19) — warn loudly.
pinned="$(grep -m1 '^node[[:space:]]*=' "$root/mise.toml" 2>/dev/null | sed 's/.*"\(.*\)".*/\1/')"
actual="$(node --version 2>/dev/null | sed 's/^v//')"
if [ -n "$pinned" ] && [ -n "$actual" ] && [ "$pinned" != "$actual" ]; then
  echo "WARNING: bare 'node' is $actual but mise.toml pins $pinned. Run commands as 'mise exec -- <cmd>'."
fi
# Pre-commit auto-fixes formatting/lint (nit, #368): 'prettier --write' + 'eslint --fix' run on
# staged files and re-stage the result, so a commit on a sloppy file proceeds. Type safety still
# blocks (tsc --noEmit); real lint/type/build errors gate at pre-push and CI (mise run verify).
echo "Pre-commit hook auto-fixes format/lint (nit, not deny, #368); typecheck still blocks."
exit 0
