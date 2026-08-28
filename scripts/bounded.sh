#!/usr/bin/env bash
# scripts/bounded.sh — global throttle for heavy tasks (#302).
#
# Several agent worktrees run `mise run check`/`verify`/`build`/vitest/tsc concurrently on the
# same box; unbounded, that has crashed both the workstation and the Claude Code process. Every
# heavy task should run through this wrapper instead of directly:
#
#   scripts/bounded.sh <command> [args...]
#
# It does three things:
#   1. Acquires one of PATCHES_CHECK_SLOTS flock-based slots (default max(2, nproc/4)) so only
#      that many bounded invocations run at once system-wide, across every worktree. If every
#      slot is busy it waits on the last slot (bounded by PATCHES_CHECK_WAIT_TIMEOUT, default
#      600s) rather than queuing unbounded, and logs when it does so.
#   2. Runs the command under `nice -n 10 ionice -c2 -n7` so bounded work always yields CPU/IO
#      to interactive use (an editor, a shell) sharing the box.
#   3. When systemd-run is available (a user session bus, e.g. a real login session — not every
#      CI/container runner has one), wraps the command in `systemd-run --user --scope` with a
#      cgroup MemoryMax (PATCHES_CHECK_MEM, default 3G) and CPUWeight=50, so one runaway task
#      can't OOM the whole machine. Falls back to running unwrapped (still niced/ioniced) if
#      systemd-run isn't usable.
#
# Env knobs (all overridable per-invocation): PATCHES_CHECK_SLOTS, PATCHES_CHECK_MEM,
# PATCHES_CHECK_WAIT_TIMEOUT, VITEST_MAX_WORKERS (default 2), NODE_OPTIONS (default
# --max-old-space-size=2048). See docs/agents/HARNESS.md.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: scripts/bounded.sh <command> [args...]" >&2
  exit 2
fi

nproc_count="$(nproc 2>/dev/null || echo 4)"
default_slots=$(( nproc_count / 4 ))
if [ "$default_slots" -lt 2 ]; then default_slots=2; fi
slots="${PATCHES_CHECK_SLOTS:-$default_slots}"
mem_max="${PATCHES_CHECK_MEM:-3G}"
wait_timeout="${PATCHES_CHECK_WAIT_TIMEOUT:-600}"

lock_dir="${TMPDIR:-/tmp}"
acquired_slot=""

for ((i = 0; i < slots; i++)); do
  lock_file="$lock_dir/patches-check.slot.$i"
  exec {slot_fd}>"$lock_file"
  if flock -n "$slot_fd"; then
    acquired_slot="$i"
    break
  fi
  eval "exec ${slot_fd}>&-"
done

if [ -z "$acquired_slot" ]; then
  last=$((slots - 1))
  lock_file="$lock_dir/patches-check.slot.$last"
  echo "bounded: all $slots check slots busy, waiting up to ${wait_timeout}s on slot $last (PATCHES_CHECK_SLOTS=$slots)..." >&2
  exec {slot_fd}>"$lock_file"
  if flock -w "$wait_timeout" "$slot_fd"; then
    acquired_slot="$last"
  else
    echo "bounded: timed out after ${wait_timeout}s waiting for a check slot; running anyway (unbounded slot)" >&2
  fi
fi

export VITEST_MAX_WORKERS="${VITEST_MAX_WORKERS:-2}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"

cmd=(nice -n 10 ionice -c2 -n7 "$@")

use_systemd_run=0
if command -v systemd-run >/dev/null 2>&1 && [ -n "${XDG_RUNTIME_DIR:-}" ]; then
  if systemd-run --user --scope --quiet -p MemoryMax=16M -- true >/dev/null 2>&1; then
    use_systemd_run=1
  fi
fi

if [ "$use_systemd_run" -eq 1 ]; then
  exec systemd-run --user --scope --quiet -p "MemoryMax=$mem_max" -p CPUWeight=50 -- "${cmd[@]}"
else
  exec "${cmd[@]}"
fi
