#!/usr/bin/env bash
# Restore a logical dump (produced by infra/scripts/db-dump.sh) into a target Postgres
# database via psql.
#
# Usage:
#   infra/scripts/db-restore.sh <dump.sql.gz> <target DATABASE_URL> [--yes] [--i-know-this-is-production]
#
# Refuses to run against a connection string that looks like the production Neon database
# (host contains "neon.tech" and database is "neondb", or the string otherwise matches the
# known production host) unless --i-know-this-is-production is also passed. Prompts for
# interactive confirmation unless --yes is given. Requires: podman (uses
# docker.io/library/postgres:18-alpine for psql). Never prints the target connection string.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

PG_IMAGE="docker.io/library/postgres:18-alpine"
PROD_HOST_MARKER="neon.tech"

DUMP_FILE=""
TARGET_URL=""
ASSUME_YES=0
CONFIRM_PRODUCTION=0

for arg in "$@"; do
  case "$arg" in
    --yes)
      ASSUME_YES=1
      ;;
    --i-know-this-is-production)
      CONFIRM_PRODUCTION=1
      ;;
    *)
      if [ -z "$DUMP_FILE" ]; then
        DUMP_FILE="$arg"
      elif [ -z "$TARGET_URL" ]; then
        TARGET_URL="$arg"
      else
        echo "db-restore: unexpected extra argument: $arg" >&2
        exit 1
      fi
      ;;
  esac
done

if [ -z "$DUMP_FILE" ] || [ -z "$TARGET_URL" ]; then
  echo "usage: infra/scripts/db-restore.sh <dump.sql.gz> <target DATABASE_URL> [--yes] [--i-know-this-is-production]" >&2
  exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "db-restore: dump file not found: $DUMP_FILE" >&2
  exit 1
fi

if echo "$TARGET_URL" | grep -q "$PROD_HOST_MARKER" && [ "$CONFIRM_PRODUCTION" -ne 1 ]; then
  echo "db-restore: refusing to target what looks like the production database ($PROD_HOST_MARKER)" >&2
  echo "db-restore: pass --i-know-this-is-production if this is really intended" >&2
  exit 1
fi

# Extract host + dbname only, for a non-secret confirmation prompt (never the full string).
TARGET_HOST="$(echo "$TARGET_URL" | sed -E 's#^[a-zA-Z]+://[^@]*@##; s#/.*$##')"
TARGET_DB="$(echo "$TARGET_URL" | sed -E 's#^[^/]*/##; s#\?.*$##')"

echo "db-restore: about to restore ${DUMP_FILE} into host=${TARGET_HOST} database=${TARGET_DB}"

if [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "Type 'yes' to continue: " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "db-restore: aborted" >&2
    exit 1
  fi
fi

echo "db-restore: restoring ..."
if ! gunzip -c "$DUMP_FILE" | podman run --rm -i --network host \
  -e DATABASE_URL="$TARGET_URL" \
  "$PG_IMAGE" \
  sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1'; then
  echo "db-restore: restore failed" >&2
  exit 1
fi

echo "db-restore: done"
