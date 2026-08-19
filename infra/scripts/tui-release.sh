#!/usr/bin/env bash
# Builds and packs the TUI tarball for a GitHub Release, and (unless --pack-only) creates
# the release itself with `gh`.
#
# Usage:
#   infra/scripts/tui-release.sh              # build, pack, and `gh release create`
#   infra/scripts/tui-release.sh --pack-only  # build and pack only — proves the tarball
#                                              # works without touching GitHub (used in CI/
#                                              # local verification; see docs/operations/release.md)
#
# Reads the version to tag from apps/tui/package.json's "version" — bump that first
# (docs/operations/release.md). Requires: pnpm, gh (authenticated) unless --pack-only.
#
# Writes dist-release/patches-social-<version>.tgz (gitignored).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

PACK_ONLY=0
if [ "${1:-}" = "--pack-only" ]; then
  PACK_ONLY=1
fi

VERSION="$(node -p "require('./apps/tui/package.json').version")"
TAG="v${VERSION}"
ASSET_NAME="patches-social-${VERSION}.tgz"
OUT_DIR="dist-release"

echo "tui-release: building @patches/tui ${VERSION}..."
pnpm --filter @patches/tui build

mkdir -p "$OUT_DIR"
rm -f "${OUT_DIR}/${ASSET_NAME}"

echo "tui-release: packing..."
(
  cd apps/tui
  pnpm pack --pack-destination "../../${OUT_DIR}"
)

if [ ! -f "${OUT_DIR}/${ASSET_NAME}" ]; then
  echo "tui-release: expected ${OUT_DIR}/${ASSET_NAME} after pack, but it's not there." >&2
  echo "tui-release: check apps/tui/package.json's publishConfig.name/version match ${VERSION}." >&2
  exit 1
fi

echo "tui-release: wrote ${OUT_DIR}/${ASSET_NAME}"

if [ "$PACK_ONLY" = "1" ]; then
  echo "tui-release: --pack-only, stopping before gh release create."
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "tui-release: gh CLI not found — install it or run with --pack-only." >&2
  exit 1
fi

echo "tui-release: creating GitHub release ${TAG}..."
gh release create "$TAG" \
  "${OUT_DIR}/${ASSET_NAME}" \
  --prerelease \
  --title "patches-social ${VERSION}" \
  --notes "See docs/operations/try-it.md for install instructions."

echo "tui-release: done. Install with:"
echo "  npm install --global --allow-remote=all https://github.com/alliecatowo/patches/releases/download/${TAG}/${ASSET_NAME}"
