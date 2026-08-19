#!/usr/bin/env bash
set -euo pipefail

# Captures a real terminal frame of the Patches TUI via tmux (P12-123).
#
# `ink-testing-library`'s synthetic stdout — what `apps/tui/test/golden.test.tsx`'s
# committed fixtures come from — never touches a real pty, a real terminfo database, or
# a real terminal emulator's own rendering of the SGR/box-drawing bytes Ink writes. tmux
# does (`docs/agents/LEARNINGS.md`, "Verifying a TTY app from a non-TTY agent shell"),
# so this script is the "does it actually look right in a real terminal" half of the
# golden-frame story: run it by hand after a layout change and eyeball the captured
# frame against the matching `test/golden/*.txt` fixture, rather than trusting the
# automated (but synthetic) drift test alone.
#
# Usage:
#   apps/tui/scripts/capture.sh [columns] [rows] [-- extra cli.tsx args...]
#
# columns/rows default to 100x30 (the `standard` golden tier). With no extra args this
# captures the connect screen against an unreachable server (deterministic, no live
# `apps/server` needed); pass `--server host:port [--insecure]` to capture an
# authenticated screen against a real one instead.
#
# Requires tmux. Prints the captured frame to stdout.

COLUMNS="${1:-100}"
ROWS="${2:-30}"
shift $(($# < 2 ? $# : 2)) || true
EXTRA_ARGS=("$@")

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TUI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SESSION="patches-capture-$$"

cleanup() {
  tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! command -v tmux >/dev/null 2>&1; then
  echo "capture.sh: tmux is required" >&2
  exit 1
fi

CMD=(mise exec -- pnpm exec tsx src/cli.tsx)
if [ "${#EXTRA_ARGS[@]}" -eq 0 ]; then
  # No live server assumed — connects to an address nothing listens on, so the
  # captured frame is always the same deterministic "can't reach the server" screen.
  CMD+=(--server 127.0.0.1:1 --insecure)
else
  CMD+=("${EXTRA_ARGS[@]}")
fi

tmux new-session -d -s "$SESSION" -x "$COLUMNS" -y "$ROWS" -c "$TUI_DIR" \
  "$(printf '%q ' "${CMD[@]}")"

# Give the app time to mount, attempt its first connect, and settle on a frame.
sleep 3
tmux capture-pane -t "$SESSION" -p
