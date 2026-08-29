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
# No Anthropic inference — all models must be llmgateway/* or opencode/*-free. Blocks direct Anthropic API use and llmgateway/claude-* selection (premium + would burn fair-use).
if printf '%s' "$cmd" | grep -Eq 'ANTHROPIC_API_KEY|anthropic/|claude-(opus|sonnet|haiku|fable)'; then
  block "Anthropic inference is prohibited — use llmgateway/* or opencode/*-free only (see docs/agents/HETEROGENEOUS.md). llmgateway/claude-* is blocked by policy (premium + fair-use)."
fi
# Worktree explosion guard — don't create worktrees by hand; the WorktreeCreate hook owns them. Prevents the 40-worktree thrash that kills TURBO_CACHE_DIR + inodes.
if printf '%s' "$cmd" | grep -Eq "${at_cmd_pos}git[[:space:]]+worktree[[:space:]]+add\b"; then
  block "don't run 'git worktree add' by hand — isolation worktrees are created by the WorktreeCreate hook only. Use disjoint file sets in the main checkout."
fi
# Prevent heavy local verification outside bounded.sh — use mise run check <ws>, not full verify/build, to respect bounded.sh throttling.
if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])(pnpm[[:space:]]+verify|pnpm[[:space:]]+build|turbo[[:space:]]+run[[:space:]]+build)\b' && ! printf '%s' "$cmd" | grep -Eq 'mise[[:space:]]+run[[:space:]]+check|bounded\.sh'; then
  # warn, don't block — CI needs it, but nudge workers toward scoped checks
  echo "NOTE: prefer 'mise run check <ws>' (bounded, scoped, turbo-cached) over 'pnpm verify/build' locally — see docs/agents/HARNESS.md" >&2
fi
# #368: formatting/lint is auto-fixed (nit) at commit, not denied — warn, never block, on the
# check-only forms so an agent reaches for the auto-fixing variant (`--write`/`--fix`) or just
# commits and lets pre-push/CI do the real gating, instead of escaping with `--no-verify`.
if printf '%s' "$cmd" | grep -Eq 'prettier[[:space:]]+(--check|--list-different)'; then
  echo "NOTE: 'prettier --check' only reports; pre-commit auto-fixes with 'prettier --write' (nit, #368). Commit/push gates run the real check." >&2
fi
if printf '%s' "$cmd" | grep -Eq 'eslint[[:space:]]' && ! printf '%s' "$cmd" | grep -Eq -- '--fix'; then
  echo "NOTE: bare 'eslint' only reports; pre-commit auto-fixes with 'eslint --fix' (nit, #368). Remaining issues gate at pre-push/CI." >&2
fi
# Cap concurrent worktrees — if >6 already exist, block new isolation to protect inodes/cache (LEARNINGS.md 2026-08-20: 11 worktrees hit 100% inodes).
if printf '%s' "$cmd" | grep -Eq 'WorktreeCreate|isolation.*worktree' 2>/dev/null; then
  count="$(git -C "${OPENCODE_PROJECT_DIR:-$(pwd)}" worktree list 2>/dev/null | wc -l || echo 0)"
  if [ "$count" -gt 6 ]; then
    block "too many worktrees ($count > 6) — collect merged ones first: .opencode/scripts/worktree-collect.sh clean or git worktree prune. Prevents inode/cache thrash."
  fi
fi
exit 0
