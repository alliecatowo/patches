#!/usr/bin/env bash
# PostToolUse: format the file that was just written/edited with Prettier, if available.
# Never fails the tool call (exit 0 always) — formatting is a convenience; `pnpm verify` is the gate.
set -uo pipefail
input="$(cat)"
file="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.file_path??"")}catch{}})' 2>/dev/null || true)"
[ -z "$file" ] || [ ! -f "$file" ] && exit 0
case "$file" in
  *.ts|*.tsx|*.js|*.mjs|*.cjs|*.json|*.md|*.yml|*.yaml|*.css) ;;
  *) exit 0 ;;
esac
case "$file" in
  */generated/*|*/node_modules/*|*/dist/*|*pnpm-lock.yaml) exit 0 ;;
esac
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
if [ -x "$root/node_modules/.bin/prettier" ]; then
  (cd "$root" && ./node_modules/.bin/prettier --log-level warn --write "$file" >/dev/null 2>&1) || true
fi
if [[ "$file" == *.proto ]] && command -v buf >/dev/null 2>&1; then
  (cd "$root/packages/proto" 2>/dev/null && buf format -w "$file" >/dev/null 2>&1) || true
fi
exit 0
