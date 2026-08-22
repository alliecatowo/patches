#!/usr/bin/env bash
set -euo pipefail

ROOT="$(dirname "${BASH_SOURCE[0]}")/../.."
SCRIPT="$ROOT/infra/scripts/neon-dev-branch.sh"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT
mkdir -p "$TEST_DIR/bin"

cat >"$TEST_DIR/bin/neon" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$NEON_FAKE_LOG"
case "$*" in
  "branches create"*) printf '{"branch":{"id":"br-ephemeral-test","name":"patches-test"}}\n' ;;
  "branches get dev-mirror"*) printf '{"branch":{"id":"br-mirror","name":"dev-mirror","current_state":"ready"}}\n' ;;
  "branches get production"*) printf '{"branch":{"id":"br-production","name":"production","current_state":"ready"}}\n' ;;
  "branches get br-other"*) printf '{"branch":{"id":"br-other","name":"patches-other","parent_id":"br-mirror","current_state":"ready"}}\n' ;;
  "branches get br-unmanaged"*) printf '{"branch":{"id":"br-unmanaged","name":"unmanaged","parent_id":"br-production","current_state":"ready"}}\n' ;;
  "branches get br-ephemeral-test"*)
    if grep -q -- 'branches create .*--parent br-production' "$NEON_FAKE_LOG"; then
      printf '{"branch":{"id":"br-ephemeral-test","name":"patches-test","parent_id":"br-production","current_state":"ready"}}\n'
    else
      printf '{"branch":{"id":"br-ephemeral-test","name":"patches-test","parent_id":"br-mirror","current_state":"ready"}}\n'
    fi
    ;;
  "branches get"*) printf '{"branch":{"id":"br-ephemeral-test","name":"patches-test","parent_id":"br-mirror","current_state":"ready"}}\n' ;;
  "connection-string"*) printf 'postgresql://role:secret@dev.example.test/neondb?sslmode=require\n' ;;
  "branches reset"*) printf '{"branch":{"id":"br-ephemeral-test","current_state":"resetting"}}\n' ;;
  "branches delete"*) printf '{"branch":{"id":"br-ephemeral-test","deleted":true}}\n' ;;
  *) exit 2 ;;
esac
EOF

cat >"$TEST_DIR/bin/psql" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[ "${PGDATABASE:-}" = 'postgresql://role:secret@dev.example.test/neondb?sslmode=require' ]
if [ "$#" -eq 0 ]; then
  printf '{"ok":true,"action":"connected"}\n'
else
  printf '1\n'
fi
EOF

cat >"$TEST_DIR/bin/pnpm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  db:migrate)
    [ "${DATABASE_URL:-}" = 'postgresql://role:secret@dev.example.test/neondb?sslmode=require' ]
    ;;
  test:integration)
    [ "${TEST_DATABASE_URL:-}" = 'postgresql://role:secret@dev.example.test/neondb?sslmode=require' ]
    ;;
  *) exit 2 ;;
esac
EOF
chmod +x "$TEST_DIR/bin/neon" "$TEST_DIR/bin/psql" "$TEST_DIR/bin/pnpm"

export PATH="$TEST_DIR/bin:$PATH"
export MISE_PROJECT_ROOT="$ROOT"
export NEON_PROJECT_ID="project-test"
export NEON_DEV_MIRROR_BRANCH="dev-mirror"
export NEON_PRODUCTION_BRANCH="production"
export NEON_DEV_STATE_FILE="$TEST_DIR/state.json"
export NEON_FAKE_LOG="$TEST_DIR/neon.log"

create_output="$($SCRIPT create --name patches-test --ttl-hours 2)"
printf '%s' "$create_output" | grep -q '"branch_id":"br-ephemeral-test"'
grep -q -- '--parent br-mirror' "$NEON_FAKE_LOG"
grep -q -- '--expires-at' "$NEON_FAKE_LOG"

status_output="$($SCRIPT status)"
printf '%s' "$status_output" | grep -q '"state":"ready"'
connect_output="$($SCRIPT connect)"
printf '%s' "$connect_output" | grep -q '"action":"connected"'
if printf '%s' "$connect_output" | grep -q 'secret'; then
  echo "connection output leaked a credential" >&2
  exit 1
fi

$SCRIPT migrate >/dev/null
$SCRIPT test >/dev/null
grep -q -- '--database-name patches_test' "$NEON_FAKE_LOG"
$SCRIPT connect --branch br-other >/dev/null
if $SCRIPT test --branch br-unmanaged >/dev/null 2>&1; then
  echo "an unmanaged branch was accepted as a test target" >&2
  exit 1
fi

mirror_reset_output="$($SCRIPT reset --yes)"
printf '%s' "$mirror_reset_output" | grep -q '"parent":"br-mirror"'
$SCRIPT destroy --yes >/dev/null
[ ! -e "$NEON_DEV_STATE_FILE" ]

if $SCRIPT create --name Invalid_Name >/dev/null 2>&1; then
  echo "invalid branch name was accepted" >&2
  exit 1
fi
if $SCRIPT create --name patches-test --ttl-hours 169 >/dev/null 2>&1; then
  echo "unsafe TTL was accepted" >&2
  exit 1
fi
if $SCRIPT create --name patches-test --parent production >/dev/null 2>&1; then
  echo "production parent override was accepted without an acknowledgement" >&2
  exit 1
fi
if printf 'USE PRODUCTION PARENT\n' | $SCRIPT create --name patches-test --parent br-unmanaged --i-know-this-is-production >/dev/null 2>&1; then
  echo "an arbitrary parent override was accepted" >&2
  exit 1
fi
if printf 'wrong phrase\n' | $SCRIPT create --name patches-test --parent production --i-know-this-is-production --yes >/dev/null 2>&1; then
  echo "--yes bypassed production-parent confirmation" >&2
  exit 1
fi
printf 'USE PRODUCTION PARENT\n' | $SCRIPT create --name patches-prod-review --parent production --i-know-this-is-production >/dev/null 2>&1
grep -q '"parent_id":"br-production"' "$NEON_DEV_STATE_FILE"
grep -q '"source":"production"' "$NEON_DEV_STATE_FILE"
if $SCRIPT reset --yes >/dev/null 2>&1; then
  echo "--yes bypassed production-derived reset confirmation" >&2
  exit 1
fi
production_reset_output="$(printf 'RESET PRODUCTION-DERIVED br-ephemeral-test\n' | $SCRIPT reset --yes)"
printf '%s' "$production_reset_output" | grep -q '"parent":"br-production"'
if $SCRIPT destroy --yes >/dev/null 2>&1; then
  echo "--yes bypassed production-derived deletion confirmation" >&2
  exit 1
fi
printf 'DELETE PRODUCTION-DERIVED br-ephemeral-test\n' | $SCRIPT destroy --yes >/dev/null
[ ! -e "$NEON_DEV_STATE_FILE" ]
if NEON_DEV_STATE_FILE="$TEST_DIR/mirror-state.json" $SCRIPT destroy --branch dev-mirror --yes >/dev/null 2>&1; then
  echo "dev mirror deletion was accepted" >&2
  exit 1
fi
if NEON_DEV_MIRROR_BRANCH=production $SCRIPT status --branch br-other >/dev/null 2>&1; then
  echo "production was accepted as the configured dev mirror" >&2
  exit 1
fi
if env -u NEON_PRODUCTION_BRANCH $SCRIPT status --branch br-other >/dev/null 2>&1; then
  echo "the helper ran without a known production branch" >&2
  exit 1
fi

printf '{"ok":true,"tests":27}\n'
