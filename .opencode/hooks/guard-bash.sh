#!/usr/bin/env bash
# PreToolUse guard for Bash: blocks package-manager misuse (pnpm-only) and a few footguns. Exit 2 = block and show the message to the agent.
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
# Tree-wide destructive git is blocked: agents run concurrently in ONE working tree, so a stash/hard-reset/checkout-. silently swallows or reverts another agent's in-progress files (hit for real 2026-08-19). Anchored to command position so *naming* one of these in a message/grep/heredoc doesn't trip it.
at_cmd_pos='(^|[;&|(])[[:space:]]*'
if printf '%s' "$cmd" | grep -Eq "${at_cmd_pos}git[[:space:]]+stash\b"; then
  block "no 'git stash' — other agents have uncommitted work in this same tree. Commit your own paths explicitly (git add <path> && git commit)."
fi
if printf '%s' "$cmd" | grep -Eq "${at_cmd_pos}git[[:space:]]+reset[[:space:]]+.*--hard\b"; then
  block "no 'git reset --hard' — it destroys other agents' uncommitted work. Revert only your own paths (git checkout -- <path>)."
fi
if printf '%s' "$cmd" | grep -Eq "${at_cmd_pos}git[[:space:]]+(checkout|restore)[[:space:]]+(--[[:space:]]+)?\.([[:space:]]|$)"; then
  block "no tree-wide 'git checkout .'/'git restore .' — name the paths you own instead."
fi
if printf '%s' "$cmd" | grep -Eq "${at_cmd_pos}git[[:space:]]+(clean[[:space:]]+.*-[a-z]*f|add[[:space:]]+(-A\b|--all\b|\.([[:space:]]|\$)))"; then
  block "no 'git add -A/.' or 'git clean -f' — stage only the explicit paths you were assigned."
fi
exit 0
