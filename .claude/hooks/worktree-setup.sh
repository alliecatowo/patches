#!/usr/bin/env bash
# WorktreeCreate: the harness requires this hook to CREATE the isolation worktree and echo
# its absolute path on stdout. The original version only ran `pnpm install` and printed
# nothing, so every isolated agent aborted with "hook succeeded but returned no worktree
# path". Fails open (echoes nothing), which the harness reports rather than silently
# running the agent in the main checkout.
#
# CAUTION: nothing else in a session may run `git worktree prune`/`remove` while agents are
# live — doing so deletes a running agent's tree out from under it and loses its work.
# Isolation is opt-in per Agent call; no agent definition should carry `isolation: worktree`
# as a default, since disjoint file sets per brief are how parallel agents are kept safe.
set -uo pipefail

input="$(cat)"
repo="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$repo" ] || exit 0

# The payload may already suggest a path; honour it when present.
dir="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.worktree_path??j.worktreePath??j.path??"")}catch{}})' 2>/dev/null || true)"

if [ -z "$dir" ]; then
  dir="${TMPDIR:-/tmp}/patches-wt/$(date +%s)-$$"
fi

mkdir -p "$(dirname "$dir")" || exit 0
git -C "$repo" worktree add --detach "$dir" HEAD >/dev/null 2>&1 || exit 0

# node_modules is a pnpm symlink farm and cannot be shared across checkouts.
( cd "$dir" && flock /tmp/patches-pnpm.lock pnpm install --prefer-offline --silent ) >/dev/null 2>&1 || true

printf '%s\n' "$dir"
exit 0
