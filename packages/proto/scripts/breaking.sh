#!/usr/bin/env bash
# Protobuf breaking-change check against the default branch (spec §41).
#
# Two things the research note gets wrong and that cost time once already:
#   1. The `.git#...` ref is resolved relative to the *current working
#      directory*, not to the module path. Running this from `packages/proto`
#      means the ref has to be `../../.git`, otherwise buf tries to clone
#      `packages/proto/.git` and dies with "does not appear to be a git repository".
#   2. `--against` fails hard ("had no .proto files") when the base branch does
#      not contain the module yet. That is the expected state for the very first
#      protobuf commit, so guard for it instead of pretending it's a violation.
set -euo pipefail

BASE_REF="${PROTO_BREAKING_BASE:-main}"
# `.git#branch=<name>` only resolves a *local* branch (refs/heads/<name>). A CI checkout
# (actions/checkout, fetch-depth: 0) has no local `main` branch — only the remote-tracking
# ref `origin/main` (refs/remotes/origin/main) — so falling back to `origin/${BASE_REF}` and
# still asking buf for `branch=` fails to resolve. `ref=` accepts any git ref/rev, remote-
# tracking included, so it's the query key that must be used once this fallback triggers
# (A-011). Track which query key applies alongside BASE_REF so both stay in sync.
GIT_QUERY_KEY="branch"
if ! git rev-parse --verify --quiet "${BASE_REF}" >/dev/null && git rev-parse --verify --quiet "origin/${BASE_REF}" >/dev/null; then
  BASE_REF="origin/${BASE_REF}"
  GIT_QUERY_KEY="ref"
fi
REPO_ROOT="$(git rev-parse --show-toplevel)"

if ! git rev-parse --verify --quiet "${BASE_REF}" >/dev/null; then
  echo "buf breaking: base ref '${BASE_REF}' not found locally — skipping."
  echo "  (CI must fetch it: actions/checkout with fetch-depth: 0, or git fetch origin ${BASE_REF})"
  exit 0
fi

# `:/` anchors the pathspec to the repository root. `pnpm --filter` runs this from
# `packages/proto`, and a bare `packages/proto/proto` pathspec is resolved *relative to the
# current directory* — so it looked for `packages/proto/packages/proto/proto`, found nothing, and
# took the "no schemas yet" exit below on every single run. The breaking check has therefore been
# a no-op since the first protobuf commit, silently, while reporting success.
if [ -z "$(git ls-tree -r --name-only "${BASE_REF}" -- ':/packages/proto/proto')" ]; then
  echo "buf breaking: '${BASE_REF}' has no protobuf schemas yet — nothing to compare against."
  exit 0
fi

cd "${REPO_ROOT}/packages/proto"
exec buf breaking --against "../../.git#${GIT_QUERY_KEY}=${BASE_REF},subdir=packages/proto"
