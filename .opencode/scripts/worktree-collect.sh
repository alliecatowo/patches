#!/usr/bin/env bash
# Collect work from agent isolation worktrees back into the main checkout.
#
# The WorktreeCreate hook (.claude/hooks/worktree-setup.sh) puts every isolated agent on
# its own `agent/wt-<slug>` branch, so finished work is reachable by branch name instead of
# being stranded in /tmp. This script is the other half of that: it reports what each
# worktree holds and, on request, merges one back.
#
# Usage:
#   worktree-collect.sh                 # list every agent worktree: branch, commits, dirty files
#   worktree-collect.sh commit <path>   # commit a worktree's uncommitted work on its own branch
#   worktree-collect.sh merge <branch>  # merge one agent branch into the current branch
#   worktree-collect.sh clean           # remove worktrees whose branches are fully merged
#
# NEVER run `clean` (or any `git worktree prune`/`remove`) while agents are still running —
# it deletes a live agent's tree out from under it. See docs/agents/LEARNINGS.md.
set -euo pipefail

repo="$(git rev-parse --show-toplevel)"
cd "$repo"

list() {
  git worktree list --porcelain | awk '/^worktree /{w=$2} /^branch /{print w"\t"$2}' |
  while IFS=$'\t' read -r path ref; do
    branch="${ref#refs/heads/}"
    case "$branch" in agent/wt-*) ;; *) continue ;; esac
    ahead="$(git rev-list --count "HEAD..$branch" 2>/dev/null || echo '?')"
    dirty="$(git -C "$path" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
    printf '%s\n  branch: %s\n  commits ahead of HEAD: %s\n  uncommitted files: %s\n' \
      "$path" "$branch" "$ahead" "$dirty"
  done
}

case "${1:-list}" in
  list)
    out="$(list)"
    if [ -z "$out" ]; then echo "no agent worktrees"; else printf '%s\n' "$out"; fi
    ;;
  commit)
    path="${2:?usage: worktree-collect.sh commit <worktree-path>}"
    # -A is safe here and only here: an isolation worktree contains exactly one agent's work,
    # which is the whole reason the repo-wide `git add -A` ban does not apply inside it.
    git -C "$path" add -A
    git -C "$path" commit -m "wip(agent): collected from isolation worktree $(basename "$path")"
    ;;
  merge)
    branch="${2:?usage: worktree-collect.sh merge <branch>}"
    git merge --no-ff "$branch"
    ;;
  clean)
    git worktree list --porcelain | awk '/^worktree /{w=$2} /^branch /{print w"\t"$2}' |
    while IFS=$'\t' read -r path ref; do
      branch="${ref#refs/heads/}"
      case "$branch" in agent/wt-*) ;; *) continue ;; esac
      if git merge-base --is-ancestor "$branch" HEAD 2>/dev/null &&
         [ -z "$(git -C "$path" status --porcelain 2>/dev/null)" ]; then
        echo "removing merged $path ($branch)"
        git worktree remove --force "$path"
        git branch -d "$branch"
      else
        echo "keeping unmerged/dirty $path ($branch)"
      fi
    done
    ;;
  *)
    echo "usage: worktree-collect.sh [list|commit <path>|merge <branch>|clean]" >&2
    exit 2
    ;;
esac
