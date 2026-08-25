#!/usr/bin/env bash
# WorktreeCreate: create the isolation worktree, make it BUILDABLE, and echo its absolute
# path on stdout. The harness requires the path on stdout — a hook that prints nothing
# aborts the agent with "hook succeeded but returned no worktree path".
#
# Three things a fresh worktree needs before an agent can work in it:
#   1. node_modules — pnpm's is a symlink farm bound to one checkout, never shareable.
#   2. dist/ — gitignored, so a fresh checkout has NO built workspace packages and every
#      cross-package import resolves to an untyped .js ("Could not find a declaration file
#      for module '@patches/proto'"). turbo build fixes this; a shared cache dir keeps it
#      cheap after the first worktree.
#   3. A named branch, not a detached HEAD, so the orchestrator can merge the work back.
#      Collect with .claude/scripts/worktree-collect.sh.
#
# CAUTION: never run `git worktree prune`/`remove` while agents are live — it deletes a
# running agent's tree out from under it and loses its work.
#
# Worktrees live under the repo's SIBLING directory, never /tmp. On 2026-08-20 three agents
# were killed mid-edit by a usage limit; /tmp is tmpfs, the machine rebooted before they could
# be resumed, and every uncommitted change went with it. A worktree holds hours of work and
# must outlive a reboot. (/tmp also runs out of *inodes* long before disk — eleven worktrees
# hit 100% of 1M inodes with 4.8G still free, and every command then fails with
# "no space left on device" on a path with plenty of space. `df -i`, not `df -h`.)
set -uo pipefail

input="$(cat)"
repo="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$repo" ] || exit 0

# The payload may already suggest a path; honour it when present.
dir="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.worktree_path??j.worktreePath??j.path??"")}catch{}})' 2>/dev/null || true)"

slug="$(date +%s)-$$"
[ -n "$dir" ] || dir="${PATCHES_WORKTREE_ROOT:-$(dirname "$repo")/patches-agent-wt}/${slug}"
branch="agent/wt-${slug}"

mkdir -p "$(dirname "$dir")" || exit 0
git -C "$repo" worktree add -b "$branch" "$dir" HEAD >/dev/null 2>&1 || exit 0

# Shared turbo cache across worktrees: the first build pays full cost, the rest replay it.
# Same location as TURBO_CACHE_DIR in mise.toml [env] — one cache for the main checkout
# and every worktree, set explicitly because this hook may run without mise env active.
cache="${TURBO_CACHE_DIR:-$HOME/.cache/patches/turbo}"
mkdir -p "$cache"

{
  cd "$dir" || exit 0
  flock /tmp/patches-pnpm.lock pnpm install --prefer-offline --silent
  # .env is in turbo's globalDependencies but gitignored — without a copy, every
  # worktree hashes differently from the main checkout and never hits its cache
  # entries (two disjoint hash families). Same machine, same local secrets: copy it.
  [ -f "$repo/.env" ] && cp "$repo/.env" "$dir/.env"
  pnpm exec turbo run build --cache-dir="$cache" --output-logs=errors-only
} >/dev/null 2>&1

printf '%s\n' "$dir"
exit 0
