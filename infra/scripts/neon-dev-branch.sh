#!/usr/bin/env bash
# Manage a single expiring Neon development branch. Ordinary branches are always
# children of NEON_DEV_MIRROR_BRANCH, which must already be anonymized and approved.
# Connection strings are consumed in-process and are never printed.
set -euo pipefail

cd "${MISE_PROJECT_ROOT:-$(dirname "${BASH_SOURCE[0]}")/../..}"

STATE_FILE="${NEON_DEV_STATE_FILE:-.mise/neon-dev-branch.json}"
DEFAULT_TTL_HOURS="${NEON_DEV_TTL_HOURS:-24}"
DATABASE_NAME="${NEON_DEV_DATABASE:-neondb}"
ROLE_NAME="${NEON_DEV_ROLE:-neondb_owner}"

usage() {
  cat >&2 <<'EOF'
usage: infra/scripts/neon-dev-branch.sh <command> [options]

commands:
  create   [--name NAME] [--ttl-hours 1..168]
           [--parent BRANCH --i-know-this-is-production]
  status   [--branch ID_OR_NAME]
  connect  [--branch ID_OR_NAME]
  migrate  [--branch ID_OR_NAME]
  test     [--branch ID_OR_NAME]
  reset    [--branch ID_OR_NAME] [--yes]
  destroy  [--branch ID_OR_NAME] [--yes]

required environment:
  NEON_PROJECT_ID          Neon project containing the approved dev mirror
  NEON_DEV_MIRROR_BRANCH  anonymized dev-mirror branch ID or name
  NEON_API_KEY             Neon credential (or use an authenticated CLI profile)

The current branch ID is stored under .mise/, which is gitignored. Override it
with NEON_DEV_STATE_FILE or select an explicit ephemeral child with --branch.
EOF
}

fail() {
  node -e 'process.stderr.write(JSON.stringify({ ok: false, error: process.argv[1] }) + "\n")' "$1"
  exit 1
}

require_value() {
  if [ "$#" -lt 2 ] || [ -z "$2" ]; then
    fail "missing value for $1"
  fi
}

validate_ref() {
  case "$1" in
    "" | *[!A-Za-z0-9_-]* | [-_]* ) fail "invalid Neon branch reference" ;;
  esac
  if [ "${#1}" -gt 63 ]; then
    fail "Neon branch reference is longer than 63 characters"
  fi
}

validate_name() {
  case "$1" in
    "" | *[!a-z0-9-]* | -* | *- ) fail "branch names must be 1-63 lowercase letters, digits, or hyphens and cannot start or end with a hyphen" ;;
  esac
  if [ "${#1}" -gt 63 ]; then
    fail "branch name is longer than 63 characters"
  fi
}

validate_ttl() {
  case "$1" in
    "" | *[!0-9]* ) fail "TTL must be an integer from 1 through 168 hours" ;;
  esac
  if [ "$1" -lt 1 ] || [ "$1" -gt 168 ]; then
    fail "TTL must be an integer from 1 through 168 hours"
  fi
}

json_event() {
  node -e '
    const [action, id, name, parent, expiresAt] = process.argv.slice(1);
    process.stdout.write(JSON.stringify({ ok: true, action, branch_id: id || undefined, branch_name: name || undefined, parent: parent || undefined, expires_at: expiresAt || undefined }) + "\n");
  ' "$@"
}

read_state() {
  local field="$1"
  [ -f "$STATE_FILE" ] || return 1
  node -e '
    const fs = require("node:fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const field = process.argv[2];
    if (typeof value[field] !== "string" || value[field].length === 0) process.exit(1);
    process.stdout.write(value[field]);
  ' "$STATE_FILE" "$field"
}

write_state() {
  local branch_id="$1" branch_name="$2" parent="$3" expires_at="$4"
  mkdir -p "$(dirname "$STATE_FILE")"
  node -e '
    const fs = require("node:fs");
    const [path, branchId, branchName, parent, expiresAt] = process.argv.slice(1);
    fs.writeFileSync(path, JSON.stringify({ branch_id: branchId, branch_name: branchName, parent, expires_at: expiresAt }) + "\n", { mode: 0o600 });
  ' "$STATE_FILE" "$branch_id" "$branch_name" "$parent" "$expires_at"
}

resolve_cli() {
  if command -v neon >/dev/null 2>&1; then
    printf 'neon'
  elif command -v neonctl >/dev/null 2>&1; then
    printf 'neonctl'
  else
    fail "Neon CLI not found; run mise install"
  fi
}

resolve_branch() {
  if [ -n "$BRANCH" ]; then
    validate_ref "$BRANCH"
    printf '%s' "$BRANCH"
    return
  fi
  read_state branch_id || fail "no current branch; run neon:dev:create or pass --branch"
}

assert_ephemeral_child() {
  local branch="$1"
  if [ "$branch" = "$NEON_DEV_MIRROR_BRANCH" ] || { [ -n "${NEON_PRODUCTION_BRANCH:-}" ] && [ "$branch" = "$NEON_PRODUCTION_BRANCH" ]; }; then
    fail "refusing to mutate the dev mirror or production branch"
  fi
}

assert_managed_child() {
  local branch="$1"
  assert_ephemeral_child "$branch"
  local branch_json mirror_json parent_id mirror_id
  branch_json="$("$NEON_CLI" branches get "$branch" --project-id "$NEON_PROJECT_ID" --output json --no-color)"
  mirror_json="$("$NEON_CLI" branches get "$NEON_DEV_MIRROR_BRANCH" --project-id "$NEON_PROJECT_ID" --output json --no-color)"
  parent_id="$(printf '%s' "$branch_json" | read_branch_field parent_id)" || fail "could not verify the selected branch parent"
  mirror_id="$(printf '%s' "$mirror_json" | read_branch_field id)" || fail "could not resolve the configured dev mirror ID"
  [ "$parent_id" = "$mirror_id" ] || fail "selected branch is not a direct child of the configured dev mirror"
}

read_branch_field() {
  local field="$1"
  node -e '
    const fs = require("node:fs");
    const value = JSON.parse(fs.readFileSync(0, "utf8"));
    const branch = value.branch ?? value;
    const field = process.argv[1];
    if (typeof branch[field] !== "string" || branch[field].length === 0) process.exit(1);
    process.stdout.write(branch[field]);
  ' "$field"
}

print_branch_status() {
  node -e '
    const fs = require("node:fs");
    const value = JSON.parse(fs.readFileSync(0, "utf8"));
    const branch = value.branch ?? value;
    process.stdout.write(JSON.stringify({
      ok: true,
      action: "status",
      branch_id: branch.id,
      branch_name: branch.name,
      parent_id: branch.parent_id,
      state: branch.current_state,
      protected: branch.protected,
      expires_at: branch.expires_at,
    }) + "\n");
  '
}

confirm_destructive() {
  local action="$1" branch="$2"
  if [ "$ASSUME_YES" -eq 1 ]; then
    return
  fi
  printf '%s is permanent for branch %s. Type the branch ID or name to continue: ' "$action" "$branch" >&2
  read -r answer
  [ "$answer" = "$branch" ] || fail "$action aborted"
}

connection_string() {
  local branch="$1" database="$2" value
  value="$("$NEON_CLI" connection-string "$branch" --project-id "$NEON_PROJECT_ID" --database-name "$database" --role-name "$ROLE_NAME" --no-color)"
  [ -n "$value" ] || fail "Neon returned an empty connection string"
  printf '%s' "$value"
}

prepare_test_databases() {
  local branch="$1" admin_url="$2" database exists
  command -v psql >/dev/null 2>&1 || fail "psql is required to prepare Neon integration-test databases"
  for database in patches_test patches_test_server patches_test_worker patches_test_admin patches_testkit_test; do
    exists="$(PGDATABASE="$admin_url" psql -Atq -c "SELECT 1 FROM pg_database WHERE datname = '$database'")"
    if [ "$exists" != "1" ]; then
      PGDATABASE="$admin_url" psql -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE $database" >/dev/null
    fi
  done
  connection_string "$branch" patches_test
}

COMMAND="${1:-}"
[ -n "$COMMAND" ] || { usage; exit 1; }
shift

BRANCH=""
NAME=""
TTL_HOURS="$DEFAULT_TTL_HOURS"
PARENT=""
ASSUME_YES=0
PRODUCTION_OVERRIDE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --branch) require_value "$@"; BRANCH="$2"; shift 2 ;;
    --name) require_value "$@"; NAME="$2"; shift 2 ;;
    --ttl-hours) require_value "$@"; TTL_HOURS="$2"; shift 2 ;;
    --parent) require_value "$@"; PARENT="$2"; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    --i-know-this-is-production) PRODUCTION_OVERRIDE=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) fail "unknown option: $1" ;;
  esac
done

[ -n "${NEON_PROJECT_ID:-}" ] || fail "NEON_PROJECT_ID is required"
[ -n "${NEON_DEV_MIRROR_BRANCH:-}" ] || fail "NEON_DEV_MIRROR_BRANCH is required"
validate_ref "$NEON_PROJECT_ID"
validate_ref "$NEON_DEV_MIRROR_BRANCH"
NEON_CLI="$(resolve_cli)"

case "$COMMAND" in
  create)
    [ -z "$BRANCH" ] || fail "--branch is not valid for create"
    validate_ttl "$TTL_HOURS"
    if [ -z "$NAME" ]; then
      safe_user="$(printf '%s' "${USER:-agent}" | tr '[:upper:]_' '[:lower:]-' | tr -cd 'a-z0-9-')"
      safe_user="${safe_user#-}"
      safe_user="${safe_user%-}"
      [ -n "$safe_user" ] || safe_user="agent"
      NAME="patches-${safe_user:0:24}-$(date -u +%Y%m%d%H%M%S)"
    fi
    validate_name "$NAME"

    if [ -z "$PARENT" ]; then
      PARENT="$NEON_DEV_MIRROR_BRANCH"
    else
      validate_ref "$PARENT"
      [ "$PARENT" != "$NEON_DEV_MIRROR_BRANCH" ] || fail "omit --parent when using the configured dev mirror"
      [ "$PRODUCTION_OVERRIDE" -eq 1 ] || fail "a parent override requires --i-know-this-is-production"
      printf 'A parent override can clone sensitive production data. Type USE PRODUCTION PARENT to continue: ' >&2
      read -r production_answer
      [ "$production_answer" = "USE PRODUCTION PARENT" ] || fail "production-parent override aborted"
    fi

    expires_at="$(node -e 'const hours=Number(process.argv[1]); process.stdout.write(new Date(Date.now()+hours*3600000).toISOString())' "$TTL_HOURS")"
    create_json="$("$NEON_CLI" branches create --project-id "$NEON_PROJECT_ID" --parent "$PARENT" --name "$NAME" --expires-at "$expires_at" --suspend-timeout 300 --output json --no-color)"
    branch_id="$(printf '%s' "$create_json" | node -e '
      const fs = require("node:fs");
      const value = JSON.parse(fs.readFileSync(0, "utf8"));
      const branch = value.branch ?? value;
      if (typeof branch.id !== "string" || !branch.id.startsWith("br-")) process.exit(1);
      process.stdout.write(branch.id);
    ')" || fail "could not read the created branch ID from Neon JSON"
    validate_ref "$branch_id"
    write_state "$branch_id" "$NAME" "$PARENT" "$expires_at"
    json_event created "$branch_id" "$NAME" "$PARENT" "$expires_at"
    ;;
  status)
    branch="$(resolve_branch)"
    "$NEON_CLI" branches get "$branch" --project-id "$NEON_PROJECT_ID" --output json --no-color | print_branch_status
    ;;
  connect)
    branch="$(resolve_branch)"
    assert_managed_child "$branch"
    command -v psql >/dev/null 2>&1 || fail "psql is required for neon:dev:connect"
    url="$(connection_string "$branch" "$DATABASE_NAME")"
    PGDATABASE="$url" exec psql
    ;;
  migrate)
    branch="$(resolve_branch)"
    assert_managed_child "$branch"
    url="$(connection_string "$branch" "$DATABASE_NAME")"
    DATABASE_URL="$url" DATABASE_SSL=true pnpm db:migrate
    json_event migrated "$branch" "" "" ""
    ;;
  test)
    branch="$(resolve_branch)"
    assert_managed_child "$branch"
    admin_url="$(connection_string "$branch" "$DATABASE_NAME")"
    test_url="$(prepare_test_databases "$branch" "$admin_url")"
    DATABASE_URL="$admin_url" TEST_DATABASE_URL="$test_url" DATABASE_SSL=true pnpm test:integration
    json_event tested "$branch" "" "" ""
    ;;
  reset)
    branch="$(resolve_branch)"
    assert_managed_child "$branch"
    confirm_destructive reset "$branch"
    "$NEON_CLI" branches reset "$branch" --project-id "$NEON_PROJECT_ID" --parent --output json --no-color >/dev/null
    json_event reset "$branch" "" "$NEON_DEV_MIRROR_BRANCH" ""
    ;;
  destroy)
    branch="$(resolve_branch)"
    assert_managed_child "$branch"
    confirm_destructive delete "$branch"
    "$NEON_CLI" branches delete "$branch" --project-id "$NEON_PROJECT_ID" --output json --no-color >/dev/null
    if [ -f "$STATE_FILE" ] && [ "$(read_state branch_id || true)" = "$branch" ]; then
      rm -f "$STATE_FILE"
    fi
    json_event destroyed "$branch" "" "" ""
    ;;
  *) usage; fail "unknown command: $COMMAND" ;;
esac
