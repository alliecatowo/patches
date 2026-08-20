#!/usr/bin/env bash
# WorktreeCreate: install deps in the new worktree. Fails open.
set -uo pipefail
input="$(cat)"
dir="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.worktree_path??j.path??j.cwd??"")}catch{}})' 2>/dev/null || true)"
[ -n "$dir" ] && [ -d "$dir" ] && cd "$dir" && pnpm install --prefer-offline --silent >/dev/null 2>&1 || true
exit 0
