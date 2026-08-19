#!/usr/bin/env bash
# Renders every VHS tape in infra/demos/tapes/ against the live flagship node
# (patches-social.fly.dev), producing GIFs/PNGs in site/public/media/ and
# downsized README-sized copies in docs/media/.
#
# Requires `vhs` + `ttyd` on PATH (mise.toml [tools]; `mise install` after
# `mise use vhs@latest ttyd@latest`) and a headless Chrome/Chromium binary
# (VHS drives it via ttyd; verified against `google-chrome` in dev). `ffmpeg`
# must be on PATH for the downsized copies.
#
# The tapes sign in as two real accounts that must already have a stored,
# restorable session on this machine (`patches whoami` succeeds with no
# prompt) — this script does not register or log in for you. Point it at
# those sessions' XDG dirs via:
#   PATCHES_DEMO_ALLIE_CONFIG / PATCHES_DEMO_ALLIE_DATA
#   PATCHES_DEMO_JUAN_CONFIG  / PATCHES_DEMO_JUAN_DATA
# If unset, this defaults to $CLAUDE_JOB_DIR/tmp/prod-{allie,juan}[-data],
# which only exists inside the agent job that first recorded these demos —
# set the four vars explicitly for any other environment.
#
# WARNING: search-follow.tape, compose.tape, and hero.tape perform real
# writes against the live flagship node (a follow, a new post, a reply) —
# they are not idempotent. Re-running this script creates new duplicate
# public content under @allie/@juan every time; don't run it just to
# "refresh" the GIFs unless you're prepared to clean up what it posts.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
ROOT="$(pwd)"
TAPES_DIR="infra/demos/tapes"
SITE_MEDIA="site/public/media"
DOCS_MEDIA="docs/media"

JOB_TMP="${CLAUDE_JOB_DIR:-}/tmp"
ALLIE_CONFIG="${PATCHES_DEMO_ALLIE_CONFIG:-$JOB_TMP/prod-allie}"
ALLIE_DATA="${PATCHES_DEMO_ALLIE_DATA:-$JOB_TMP/prod-allie-data}"
JUAN_CONFIG="${PATCHES_DEMO_JUAN_CONFIG:-$JOB_TMP/prod-juan}"
JUAN_DATA="${PATCHES_DEMO_JUAN_DATA:-$JOB_TMP/prod-juan-data}"

for d in "$ALLIE_CONFIG" "$ALLIE_DATA" "$JUAN_CONFIG" "$JUAN_DATA"; do
  if [ ! -d "$d" ]; then
    echo "error: expected a stored-session directory at $d (see script header)" >&2
    exit 1
  fi
done

command -v vhs >/dev/null 2>&1 || { echo "error: vhs not on PATH (mise install)" >&2; exit 1; }
command -v ttyd >/dev/null 2>&1 || { echo "error: ttyd not on PATH (mise install)" >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "error: ffmpeg not on PATH" >&2; exit 1; }

echo "==> building @patches/tui"
pnpm --filter @patches/tui build >/dev/null

mkdir -p "$SITE_MEDIA" "$DOCS_MEDIA"

as_allie() {
  XDG_CONFIG_HOME="$ALLIE_CONFIG" XDG_DATA_HOME="$ALLIE_DATA" \
    PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1 vhs "$1"
}

as_juan() {
  XDG_CONFIG_HOME="$JUAN_CONFIG" XDG_DATA_HOME="$JUAN_DATA" \
    PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1 vhs "$1"
}

echo "==> search-follow.gif (@juan follows @allie)"
as_juan "$TAPES_DIR/search-follow.tape"

echo "==> compose.gif (@allie posts)"
as_allie "$TAPES_DIR/compose.tape"

echo "==> hero.gif (@juan home -> thread -> reply -> notifications)"
as_juan "$TAPES_DIR/hero.tape"

echo "==> screens.tape (@juan help + plain-mode screenshots)"
as_juan "$TAPES_DIR/screens.tape"

echo "==> cli.gif (@juan --help / whoami / ping)"
as_juan "$TAPES_DIR/cli.tape"

echo "==> shrinking GIF copies for docs/media (<=1.5MB each, two-pass palette)"
for gif in hero compose search-follow cli; do
  src="$SITE_MEDIA/$gif.gif"
  dst="$DOCS_MEDIA/$gif.gif"
  palette="$(mktemp --suffix=.png)"
  [ -f "$src" ] || { echo "warning: missing $src, skipping" >&2; continue; }
  # A naive `-vf scale` re-encode of an already-palette-optimized GIF bloats it by
  # 100x+ (no shared palette across frames) — generate one palette, then reuse it.
  ffmpeg -y -i "$src" -vf "fps=10,scale=900:-1:flags=lanczos,palettegen=stats_mode=diff" \
    "$palette" </dev/null >/dev/null 2>&1
  ffmpeg -y -i "$src" -i "$palette" \
    -filter_complex "fps=10,scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer" \
    -loop 0 "$dst" </dev/null >/dev/null 2>&1
  rm -f "$palette"
  echo "  $dst ($(du -h "$dst" | cut -f1))"
done

echo "==> copying screenshots to docs/media"
for png in home thread notifications profile help plain; do
  src="$SITE_MEDIA/$png.png"
  [ -f "$src" ] || { echo "warning: missing $src, skipping" >&2; continue; }
  cp "$src" "$DOCS_MEDIA/$png.png"
done

echo "==> done. site/public/media/ has full-res outputs; docs/media/ has README-sized copies."
