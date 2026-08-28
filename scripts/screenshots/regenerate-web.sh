#!/usr/bin/env bash
# Fixes #305 — regenerates docs/media/web/*.png from apps/web/e2e/readme-screenshots.spec.ts
# against the isolated one-node lab harness (packages/harness), so README media reflects the
# real, current web PWA rather than hand-made captures.
#
# Usage: mise run screenshots:web  (or run this script directly from the repo root)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "==> Killing any stray processes on lab ports (:4173 web preview, :8088 harness HTTP, :50058 harness gRPC)"
for port in 4173 8088 50058; do
  pid="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
  if [ -n "${pid}" ]; then
    echo "    killing pid ${pid} on port ${port}"
    kill "${pid}" 2>/dev/null || true
  fi
done

echo "==> Starting the lab harness (mise run lab)"
mise run lab

echo "==> Capturing README screenshots (pnpm --filter @patches/web test:e2e -- readme-screenshots)"
pnpm --filter @patches/web test:e2e -- readme-screenshots

echo "==> Done. New PNGs are under docs/media/web/ — review with 'git status docs/media/web' and commit."
