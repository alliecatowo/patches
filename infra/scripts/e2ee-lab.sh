#!/usr/bin/env bash
#
# E2EE interop lab (originally B-108 acceptance, P13-014): boots one real Patches node
# (server + worker OS processes against the compose Postgres stack — same shape as
# `infra/lab/fed-lab.sh`, single node) and runs the automated acceptance walk:
#
#   1. Two accounts registered via curl (Connect-JSON Register over the HTTP edge).
#   2. GetE2eeCapability (session-scoped, via curl) must report
#      E2EE_CAPABILITY_STATE_ENABLED — E2EE is an always-on feature (ADR 0036 Amendment,
#      2026-08-26 owner override), so a node with a signing key reports ENABLED with no
#      special env flip needed.
#   3. `patches-admin user show` (the admin CLI, spec §65) verifies both accounts exist
#      and are ACTIVE. Note: there is deliberately no "verify email" admin command —
#      registration never requires an email (spec §165), so this is account verification.
#   4. `e2ee-lab-driver.mjs` walks the full E2EE flow: publish identity roots, enroll one
#      certified device per account, mutual follow (§183.2 first-contact eligibility),
#      create the E2EE_V1 conversation, send a reply, verify byte-identical receipt +
#      franking tag in the recipient mailbox, acknowledge, and confirm the drain.
#
# What a green run proves: the deployed node honors the entire E2EE_V1 node-side contract —
# capability disclosure, root/certificate/roster/prekey verification, conversation creation,
# atomic fanout with digest checks, franking-tag issuance, mailbox delivery, ack cleanup —
# over the real HTTP transport a non-gRPC client uses. What it does NOT prove: client-side
# Double Ratchet seal/open (envelope bodies are opaque bytes by design, ADR 2020 §8; the TUI
# is the seal/open reference and its suites cover that half).
#
# Usage:
#   infra/scripts/e2ee-lab.sh run     default: up + walk + down, nonzero exit on any failure
#   infra/scripts/e2ee-lab.sh up      leave the node running (drive it with the TUI:
#                                     node apps/tui/dist/cli.js --insecure --server 127.0.0.1:50063)
#   infra/scripts/e2ee-lab.sh down    stop the lab node (leaves the patches_e2ee_lab DB)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

RUN_DIR="infra/scripts/.run"
LOG_DIR="$RUN_DIR/logs"

HTTP_PORT=8084
GRPC_PORT=50063
DB_NAME=patches_e2ee_lab
DB_URL="postgres://patches:patches@127.0.0.1:5432/${DB_NAME}"
HTTP_ORIGIN="http://127.0.0.1:${HTTP_PORT}"

PROCS=(e2ee-server e2ee-worker)

pid_file() {
  echo "$RUN_DIR/$1.pid"
}

is_running() {
  local pid_path
  pid_path="$(pid_file "$1")"
  [ -f "$pid_path" ] && kill -0 "$(cat "$pid_path")" 2>/dev/null
}

wait_port() {
  local port=$1 i
  for i in $(seq 1 60); do
    (echo > "/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  echo "Timed out waiting for 127.0.0.1:${port} to open." >&2
  return 1
}

# Node one-liners used instead of jq (mise guarantees node; jq is not a repo dependency).
json_field() {
  local file=$1 accessor=$2
  node -e "const v=JSON.parse(require('fs').readFileSync('$file','utf8'))$accessor; process.stdout.write(String(v))"
}

cmd_up() {
  mkdir -p "$RUN_DIR" "$LOG_DIR"

  local name
  for name in "${PROCS[@]}"; do
    if is_running "$name"; then
      echo "e2ee-lab looks already running ($name pid $(cat "$(pid_file "$name")")). Run '${BASH_SOURCE[0]} down' first." >&2
      exit 1
    fi
  done

  echo "==> Building server, worker, admin CLI"
  mise exec -- pnpm turbo run build --filter=@patches/server --filter=@patches/worker --filter=@patches/admin

  echo "==> Ensuring compose Postgres is up"
  mise run compose -- up -d postgres
  local i
  for i in $(seq 1 30); do
    (echo >/dev/tcp/127.0.0.1/5432) >/dev/null 2>&1 && break
    sleep 1
  done

  echo "==> Creating lab database (idempotent)"
  local exists
  exists="$(mise run compose -- exec -T postgres psql -U patches -d patches -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'")"
  if [ "$exists" != "1" ]; then
    echo "  creating ${DB_NAME}"
    mise run compose -- exec -T postgres psql -U patches -d patches -c "CREATE DATABASE ${DB_NAME} OWNER patches"
  fi

  echo "==> Migrating lab database"
  DATABASE_URL="$DB_URL" mise exec -- pnpm db:migrate

  echo "==> Generating signing keys + auth-code delivery keyring"
  local keys jwt_private jwt_public
  keys="$(mise exec -- pnpm keys:generate)"
  jwt_private="$(printf '%s\n' "$keys" | sed -n 's/^JWT_PRIVATE_KEY=//p')"
  jwt_public="$(printf '%s\n' "$keys" | sed -n 's/^JWT_PUBLIC_KEY=//p')"
  AUTH_CODE_KEYS="$(node -e "process.stdout.write(JSON.stringify({lab:require('crypto').randomBytes(32).toString('base64')}))")"

  echo "==> Starting server (E2EE is always-on; no rollout flags to set)"
  NODE_ENV=development \
    DATABASE_URL="$DB_URL" \
    NODE_DOMAIN=e2ee-lab.localhost \
    PUBLIC_ORIGIN="$HTTP_ORIGIN" \
    HTTP_PORT="$HTTP_PORT" \
    GRPC_HOST=127.0.0.1 \
    GRPC_PORT="$GRPC_PORT" \
    INVITE_ONLY=false \
    AUTH_CODE_DELIVERY_KEYS="$AUTH_CODE_KEYS" \
    AUTH_CODE_DELIVERY_ACTIVE_KEY_ID=lab \
    JWT_PRIVATE_KEY="$jwt_private" \
    JWT_PUBLIC_KEY="$jwt_public" \
    node apps/server/dist/main.js >"$LOG_DIR/server.log" 2>&1 &
  echo $! >"$(pid_file e2ee-server)"

  echo "==> Waiting for the gRPC + Connect HTTP listeners"
  wait_port "$GRPC_PORT"
  wait_port "$HTTP_PORT"

  echo "==> Starting worker"
  NODE_ENV=development \
    DATABASE_URL="$DB_URL" \
    PUBLIC_ORIGIN="$HTTP_ORIGIN" \
    EMAIL_PROVIDER=console \
    EMAIL_FROM=noreply@localhost \
    AUTH_CODE_DELIVERY_KEYS="$AUTH_CODE_KEYS" \
    AUTH_CODE_DELIVERY_ACTIVE_KEY_ID=lab \
    node apps/worker/dist/main.js >"$LOG_DIR/worker.log" 2>&1 &
  echo $! >"$(pid_file e2ee-worker)"

  echo "==> Node up: grpc 127.0.0.1:${GRPC_PORT}  http ${HTTP_ORIGIN}  logs: ${LOG_DIR}/"
}

step() {
  printf '==> %s\n' "$1"
}

die() {
  echo "LAB FAILED: $1" >&2
  echo "Logs: ${LOG_DIR}/  Stop with: ${BASH_SOURCE[0]} down" >&2
  exit 1
}

cmd_walk() {
  for name in "${PROCS[@]}"; do
    is_running "$name" || die "lab node is not running (${name}); start it with '${BASH_SOURCE[0]} up'"
  done

  step "1/5 register alice + bob via curl (Connect edge)"
  # Run-unique handles (lowercase/digits/underscore per spec §22) so re-running against the
  # kept lab database never collides with a previous run's accounts.
  local alice_handle="alice_$RANDOM" bob_handle="bob_$RANDOM"
  curl -sS -o "$RUN_DIR/alice.json" -X POST \
    -H 'content-type: application/json' \
    -d '{"handle":"'"$alice_handle"'","displayName":"Alice Lab","password":"lab-alice-pass-1234","clientRequestId":"'$(uuidgen 2>/dev/null || node -e "process.stdout.write(require('crypto').randomUUID())")'"}' \
    "$HTTP_ORIGIN/patches.v1.AuthService/Register" \
    || die "alice Register curl failed"
  curl -sS -o "$RUN_DIR/bob.json" -X POST \
    -H 'content-type: application/json' \
    -d '{"handle":"'"$bob_handle"'","displayName":"Bob Lab","password":"lab-bob-pass-123456","clientRequestId":"'$(uuidgen 2>/dev/null || node -e "process.stdout.write(require('crypto').randomUUID())")'"}' \
    "$HTTP_ORIGIN/patches.v1.AuthService/Register" \
    || die "bob Register curl failed"
  local alice_token bob_token
  alice_token="$(json_field "$RUN_DIR/alice.json" '.session?.accessToken')"
  bob_token="$(json_field "$RUN_DIR/bob.json" '.session?.accessToken')"
  [ "$(json_field "$RUN_DIR/alice.json" '.session?.actor?.handle')" = "$alice_handle" ] \
    || die "alice registration failed: $(tr -d '\n' <"$RUN_DIR/alice.json" | cut -c1-300)"
  [ "$(json_field "$RUN_DIR/bob.json" '.session?.actor?.handle')" = "$bob_handle" ] \
    || die "bob registration failed: $(tr -d '\n' <"$RUN_DIR/bob.json" | cut -c1-300)"
  echo "    registered ${alice_handle} + ${bob_handle}"

  step "2/5 capability must report E2EE_CAPABILITY_STATE_ENABLED"
  # Session-scoped like every other E2eeService RPC (the controller's AuthGuard) — a client
  # fetches it right after login, before offering enrollment (P13-010).
  curl -sS -o "$RUN_DIR/capability.json" -X POST \
    -H 'content-type: application/json' \
    -H "authorization: Bearer ${alice_token}" \
    -d '{}' \
    "$HTTP_ORIGIN/patches.v1.E2eeService/GetE2eeCapability" \
    || die "GetE2eeCapability curl failed"
  local state
  state="$(json_field "$RUN_DIR/capability.json" '.capability?.state')"
  [ "$state" = "E2EE_CAPABILITY_STATE_ENABLED" ] \
    || die "expected E2EE_CAPABILITY_STATE_ENABLED, got: ${state}"
  echo "    state=${state}"

  step "3/5 admin CLI verifies both accounts"
  local admin_output admin_status admin_handle
  for admin_handle in "$alice_handle" "$bob_handle"; do
    admin_output="$(DATABASE_URL="$DB_URL" node apps/admin/dist/main.js user show "$admin_handle" --json)"
    admin_status="$(printf '%s' "$admin_output" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).status))")"
    [ "$admin_status" = "ACTIVE" ] || die "admin CLI: ${admin_handle} not ACTIVE (${admin_status})"
  done
  echo "    ${alice_handle} + ${bob_handle} ACTIVE per patches-admin"

  step "4/5 full E2EE flow walk (roots, enroll, conversation, send, receipt)"
  LAB_ROOT="$ROOT_DIR" \
  LAB_HTTP_ORIGIN="$HTTP_ORIGIN" \
  LAB_ALICE="$(node -e "const s=JSON.parse(require('fs').readFileSync('$RUN_DIR/alice.json','utf8')).session;process.stdout.write(JSON.stringify({token:s.accessToken,actorId:s.actor.id}))")" \
  LAB_BOB="$(node -e "const s=JSON.parse(require('fs').readFileSync('$RUN_DIR/bob.json','utf8')).session;process.stdout.write(JSON.stringify({token:s.accessToken,actorId:s.actor.id}))")" \
    node infra/scripts/e2ee-lab-driver.mjs || die "interop walk failed (see output above)"
  step "5/5 PASS — B-108 acceptance green"
}

cmd_down() {
  local any=0
  local name pid_path pid waited
  for name in "${PROCS[@]}"; do
    pid_path="$(pid_file "$name")"
    if [ -f "$pid_path" ]; then
      pid="$(cat "$pid_path")"
      if kill -0 "$pid" 2>/dev/null; then
        echo "==> Stopping $name (pid $pid)"
        kill "$pid" 2>/dev/null || true
        waited=0
        while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt 30 ]; do
          sleep 0.2
          waited=$((waited + 1))
        done
        kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
        any=1
      fi
      rm -f "$pid_path"
    fi
  done
  if [ "$any" = 0 ]; then
    echo "e2ee-lab is not running (no PID files in $RUN_DIR)."
  else
    echo "e2ee-lab stopped."
  fi
}

case "${1:-run}" in
  up) cmd_up ;;
  walk) cmd_walk ;;
  run)
    cmd_up
    cmd_walk
    cmd_down
    echo "Lab torn down. Database ${DB_NAME} kept (drop by hand for a clean slate)."
    ;;
  down) cmd_down ;;
  *)
    echo "Usage: $0 [run|up|walk|down]" >&2
    exit 1
    ;;
esac
