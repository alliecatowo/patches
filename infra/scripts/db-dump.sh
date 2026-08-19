#!/usr/bin/env bash
# Logical backup of the Patches production (or any target) Postgres database.
#
# Usage:
#   infra/scripts/db-dump.sh                 # dumps Neon production (patches project)
#   DATABASE_URL=postgres://... infra/scripts/db-dump.sh   # dumps an arbitrary target
#                                              # (e.g. a `flyctl proxy`'d Fly Postgres cluster)
#
# Requires: podman (uses docker.io/library/postgres:18-alpine for pg_dump/psql — this
# machine has no local pg_dump), repo-root .env with NEON_API_KEY (only needed when
# DATABASE_URL is not already set), neonctl on PATH.
#
# Writes backups/patches-<UTC timestamp>.sql.gz (gitignored). Never prints the connection
# string or any secret — only sizes/counts/timestamps.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

PG_IMAGE="docker.io/library/postgres:18-alpine"
NEON_PROJECT_ID="shy-recipe-96135980"
BACKUP_DIR="backups"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="${BACKUP_DIR}/patches-${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  if [ ! -f .env ]; then
    echo "db-dump: no DATABASE_URL set and no .env found to read NEON_API_KEY from" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
  if [ -z "${NEON_API_KEY:-}" ]; then
    echo "db-dump: NEON_API_KEY not set in .env" >&2
    exit 1
  fi
  DATABASE_URL="$(neonctl connection-string --project-id "$NEON_PROJECT_ID" --api-key "$NEON_API_KEY" | sed 's/&channel_binding=require//')"
fi

echo "db-dump: dumping to ${OUT_FILE} ..."

if ! podman run --rm --network host \
  -e DATABASE_URL="$DATABASE_URL" \
  "$PG_IMAGE" \
  sh -c 'pg_dump "$DATABASE_URL" --no-owner --no-privileges' \
  | gzip > "$OUT_FILE"; then
  echo "db-dump: pg_dump failed" >&2
  rm -f "$OUT_FILE"
  exit 1
fi

if [ ! -s "$OUT_FILE" ]; then
  echo "db-dump: output file is empty, treating as failure" >&2
  rm -f "$OUT_FILE"
  exit 1
fi

SIZE="$(du -h "$OUT_FILE" | cut -f1)"
echo "db-dump: wrote ${OUT_FILE} (${SIZE})"

echo "db-dump: row counts ..."
COUNT_SQL="select 'users' as table_name, count(*) from users union all select 'posts', count(*) from posts;"
if ! podman run --rm --network host \
  -e DATABASE_URL="$DATABASE_URL" \
  -e COUNT_SQL="$COUNT_SQL" \
  "$PG_IMAGE" \
  sh -c 'psql "$DATABASE_URL" -Atc "$COUNT_SQL"'; then
  echo "db-dump: row count query failed (dump file was still written)" >&2
  exit 1
fi

echo "db-dump: done"
