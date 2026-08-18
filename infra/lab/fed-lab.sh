#!/usr/bin/env bash
#
# Manual two-node federation lab (B-029). Runs two full Patches nodes (each a real `apps/
# server` + `apps/worker` OS process, `FEDERATION_ENABLED=true`) against the compose Postgres
# stack, so a human can drive them with the TUI instead of the automated two-node integration
# test (`apps/server/test/federation-two-node.integration.test.ts`, `apps/server/test/support/
# federation-node.ts`) — same env-var shape as that test, same "non-production nodes talk
# plain http over loopback" trust model (`apps/server/src/modules/federation/security/
# safe-fetch.ts`'s `defaultSafeFetchPolicy`), just two long-running processes instead of a
# vitest run.
#
# Usage:
#   mise run fed:lab        (= infra/lab/fed-lab.sh up)
#   mise run fed:lab:down   (= infra/lab/fed-lab.sh down)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

RUN_DIR="infra/lab/.run"
LOG_DIR="$RUN_DIR/logs"

A_HTTP_PORT=8081
A_GRPC_PORT=50061
B_HTTP_PORT=8082
B_GRPC_PORT=50062

DB_URL_A="postgres://patches:patches@127.0.0.1:5432/patches_lab_a"
DB_URL_B="postgres://patches:patches@127.0.0.1:5432/patches_lab_b"

PROCS=(server-a server-b worker-a worker-b)

pid_file() {
  echo "$RUN_DIR/$1.pid"
}

is_running() {
  local pid_path
  pid_path="$(pid_file "$1")"
  [ -f "$pid_path" ] && kill -0 "$(cat "$pid_path")" 2>/dev/null
}

wait_port() {
  local port=$1
  local i
  for i in $(seq 1 60); do
    (echo > "/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  echo "Timed out waiting for 127.0.0.1:${port} to open." >&2
  return 1
}

start_server() {
  local node=$1 db_url=$2 domain=$3 http_port=$4 grpc_port=$5 jwt_private=$6 jwt_public=$7
  NODE_ENV=development \
    DATABASE_URL="$db_url" \
    NODE_DOMAIN="$domain" \
    PUBLIC_ORIGIN="http://127.0.0.1:${http_port}" \
    FEDERATION_ENABLED=true \
    FEDERATION_KEY_ENCRYPTION_KEY="$FEDERATION_KEY_ENCRYPTION_KEY" \
    HTTP_PORT="$http_port" \
    GRPC_HOST=127.0.0.1 \
    GRPC_PORT="$grpc_port" \
    INVITE_ONLY=false \
    JWT_PRIVATE_KEY="$jwt_private" \
    JWT_PUBLIC_KEY="$jwt_public" \
    node apps/server/dist/main.js >"$LOG_DIR/server-${node}.log" 2>&1 &
  echo $! >"$(pid_file "server-${node}")"
}

start_worker() {
  local node=$1 db_url=$2 origin=$3
  NODE_ENV=development \
    DATABASE_URL="$db_url" \
    FEDERATION_KEY_ENCRYPTION_KEY="$FEDERATION_KEY_ENCRYPTION_KEY" \
    PUBLIC_ORIGIN="$origin" \
    EMAIL_PROVIDER=console \
    EMAIL_FROM=noreply@localhost \
    node apps/worker/dist/main.js >"$LOG_DIR/worker-${node}.log" 2>&1 &
  echo $! >"$(pid_file "worker-${node}")"
}

print_next_steps() {
  cat <<EOF

==> Two nodes are up.
    Node A: grpc 127.0.0.1:${A_GRPC_PORT}  http 127.0.0.1:${A_HTTP_PORT}  (NODE_DOMAIN=a.localhost)
    Node B: grpc 127.0.0.1:${B_GRPC_PORT}  http 127.0.0.1:${B_HTTP_PORT}  (NODE_DOMAIN=b.localhost)
    Logs:   $LOG_DIR/*.log

Next steps (no OS keyring in most dev sandboxes: 'register'/'login' don't take a
--allow-insecure-credential-file flag of their own — set
PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1 in the environment instead, spec §37):

  1. Register alice on node A:
       PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1 printf '%s' 'alice-pass-1234' | \\
         PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1 node apps/tui/dist/cli.js \\
         --insecure --server 127.0.0.1:${A_GRPC_PORT} \\
         register --handle alice --password-stdin

  2. Register bob on node B:
       PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1 printf '%s' 'bob-pass-1234' | \\
         PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1 node apps/tui/dist/cli.js \\
         --insecure --server 127.0.0.1:${B_GRPC_PORT} \\
         register --handle bob --password-stdin

  3. Run the TUI against node A as alice:
       node apps/tui/dist/cli.js --insecure --server 127.0.0.1:${A_GRPC_PORT}
     Press '/' to search, type 'bob@127.0.0.1:${B_HTTP_PORT}' (ResolveActor does a WebFinger
     lookup against node B's PUBLIC_ORIGIN — see docs/operations/federation.md "Manual
     two-node lab" for why the acct domain is the http origin, not NODE_DOMAIN), then 'f' to
     follow. Node B auto-accepts; delivery is async via worker-b/worker-a — poll (`r` refresh)
     or curl the loopback-only snapshot: `curl http://127.0.0.1:${A_HTTP_PORT}/federation/metrics`
     / `curl http://127.0.0.1:${B_HTTP_PORT}/federation/metrics` (see docs/operations/
     federation.md "Metrics" — per-job success isn't logged at the default LOG_LEVEL, only
     the metrics snapshot and loud failures are).

  4. Run the TUI against node B as bob (separate terminal) and post something. Watch for it
     on alice's home feed on node A once worker-b delivers the Create and worker-a's inbox
     handling on node A completes.

  5. 'mise run fed:lab:down' when done — kills the four PIDs in $RUN_DIR, leaves the
     patches_lab_a/patches_lab_b databases in place for next time (drop them by hand if you
     want a clean slate; migrations re-run idempotently either way).
EOF
}

cmd_up() {
  mkdir -p "$RUN_DIR" "$LOG_DIR"

  local name
  for name in "${PROCS[@]}"; do
    if is_running "$name"; then
      echo "fed:lab looks already running ($name pid $(cat "$(pid_file "$name")")). Run 'mise run fed:lab:down' first." >&2
      exit 1
    fi
  done

  echo "==> Building server, worker, tui"
  mise exec -- pnpm turbo run build --filter=@patches/server --filter=@patches/worker --filter=@patches/tui

  echo "==> Ensuring compose Postgres is up"
  mise run compose -- up -d postgres
  local i
  for i in $(seq 1 30); do
    (echo >/dev/tcp/127.0.0.1/5432) >/dev/null 2>&1 && break
    sleep 1
  done

  echo "==> Creating lab databases (idempotent)"
  local db exists
  for db in patches_lab_a patches_lab_b; do
    exists="$(mise run compose -- exec -T postgres psql -U patches -d patches -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'")"
    if [ "$exists" != "1" ]; then
      echo "  creating ${db}"
      mise run compose -- exec -T postgres psql -U patches -d patches -c "CREATE DATABASE ${db} OWNER patches"
    fi
  done

  echo "==> Migrating lab databases"
  DATABASE_URL="$DB_URL_A" mise exec -- pnpm db:migrate
  DATABASE_URL="$DB_URL_B" mise exec -- pnpm db:migrate

  echo "==> Generating signing keys (one JWT keypair per node, one shared federation key)"
  local keys_a keys_b
  keys_a="$(mise exec -- pnpm keys:generate)"
  keys_b="$(mise exec -- pnpm keys:generate)"
  local jwt_private_a jwt_public_a jwt_private_b jwt_public_b
  jwt_private_a="$(printf '%s\n' "$keys_a" | sed -n 's/^JWT_PRIVATE_KEY=//p')"
  jwt_public_a="$(printf '%s\n' "$keys_a" | sed -n 's/^JWT_PUBLIC_KEY=//p')"
  jwt_private_b="$(printf '%s\n' "$keys_b" | sed -n 's/^JWT_PRIVATE_KEY=//p')"
  jwt_public_b="$(printf '%s\n' "$keys_b" | sed -n 's/^JWT_PUBLIC_KEY=//p')"
  FEDERATION_KEY_ENCRYPTION_KEY="$(openssl rand -base64 32)"

  echo "==> Starting node A"
  start_server a "$DB_URL_A" a.localhost "$A_HTTP_PORT" "$A_GRPC_PORT" "$jwt_private_a" "$jwt_public_a"
  echo "==> Starting node B"
  start_server b "$DB_URL_B" b.localhost "$B_HTTP_PORT" "$B_GRPC_PORT" "$jwt_private_b" "$jwt_public_b"

  echo "==> Waiting for both nodes' gRPC + federation HTTP listeners"
  wait_port "$A_GRPC_PORT"
  wait_port "$B_GRPC_PORT"
  wait_port "$A_HTTP_PORT"
  wait_port "$B_HTTP_PORT"

  echo "==> Starting worker A / worker B"
  start_worker a "$DB_URL_A" "http://127.0.0.1:${A_HTTP_PORT}"
  start_worker b "$DB_URL_B" "http://127.0.0.1:${B_HTTP_PORT}"

  print_next_steps

  if [ -t 1 ]; then
    echo "==> Tailing logs (Ctrl-C only stops watching — nodes keep running; 'mise run fed:lab:down' to stop them)"
    tail -n +1 -f "$LOG_DIR"/*.log
  else
    echo "Not a terminal — skipping log tail. Logs: $LOG_DIR/*.log"
  fi
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
    echo "fed:lab is not running (no PID files in $RUN_DIR)."
  else
    echo "fed:lab stopped."
  fi
}

case "${1:-up}" in
  up) cmd_up ;;
  down) cmd_down ;;
  *)
    echo "Usage: $0 [up|down]" >&2
    exit 1
    ;;
esac
