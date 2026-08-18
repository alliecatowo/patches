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
REPO_ROOT="$(git rev-parse --show-toplevel)"

if ! git rev-parse --verify --quiet "${BASE_REF}" >/dev/null; then
  echo "buf breaking: base ref '${BASE_REF}' not found locally — skipping."
  echo "  (CI must fetch it: actions/checkout with fetch-depth: 0, or git fetch origin ${BASE_REF})"
  exit 0
fi

if [ -z "$(git ls-tree -r --name-only "${BASE_REF}" -- packages/proto/proto)" ]; then
  echo "buf breaking: '${BASE_REF}' has no protobuf schemas yet — nothing to compare against."
  exit 0
fi

cd "${REPO_ROOT}/packages/proto"
exec buf breaking --against "../../.git#branch=${BASE_REF},subdir=packages/proto"
