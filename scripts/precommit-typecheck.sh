#!/usr/bin/env bash
# scripts/precommit-typecheck.sh — pre-commit tier of #302's tiered verification: `tsc --noEmit`
# for only the workspaces that own a staged .ts/.tsx/.mts/.cts file, not the whole repo. Lefthook
# passes staged file paths as args (see lefthook.yml's `precommit-typecheck` command).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if [ "$#" -eq 0 ]; then
  exit 0
fi

workspaces=()
for f in "$@"; do
  case "$f" in *.ts | *.tsx | *.mts | *.cts) ;; *) continue ;; esac
  dir="$(dirname "$f")"
  while [ "$dir" != "." ] && [ ! -f "$dir/tsconfig.json" ]; do
    dir="$(dirname "$dir")"
  done
  [ -f "$dir/tsconfig.json" ] || continue
  found=0
  for existing in "${workspaces[@]:-}"; do
    [ "$existing" = "$dir" ] && found=1 && break
  done
  [ "$found" -eq 0 ] && workspaces+=("$dir")
done

if [ "${#workspaces[@]}" -eq 0 ]; then
  exit 0
fi

for dir in "${workspaces[@]}"; do
  echo "→ typecheck $dir"
  scripts/bounded.sh pnpm exec tsc --noEmit -p "$dir"
done
