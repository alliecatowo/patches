#!/usr/bin/env bash
# PreToolUse guard for Bash. Blocks package-manager misuse (this repo is pnpm-only)
# and a few footguns. Exit 2 = block and show the message to the agent.
set -euo pipefail
input="$(cat)"
cmd="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command??"")}catch{}})' 2>/dev/null || true)"
[ -z "$cmd" ] && exit 0

block() { echo "BLOCKED by .claude/hooks/guard-bash.sh: $1" >&2; exit 2; }

if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])npm[[:space:]]+(install|i|add|ci|uninstall|remove|rm|update|up)\b'; then
  block "use pnpm, never npm, for installs (pnpm add <pkg> --filter <workspace>)."
fi
if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])yarn([[:space:]]|$)'; then
  block "use pnpm, never yarn."
fi
if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])npx[[:space:]]'; then
  block "use 'pnpm exec' / 'pnpm dlx' instead of npx."
fi
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push[[:space:]].*(-f|--force)([[:space:]]|$)'; then
  block "no force pushes."
fi
if printf '%s' "$cmd" | grep -Eq 'synchronize:[[:space:]]*true'; then
  block "TypeORM synchronize:true is prohibited (spec §16.1)."
fi
exit 0
