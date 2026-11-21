#!/usr/bin/env bash
# Start/stop a user-owned PostgreSQL cluster for local AutoHire development.
# It never touches the system PostgreSQL service (usually port 5432).
#
# Usage:
#   ./scripts/dev_postgres.sh init     # first time: initdb + start + create DBs
#   ./scripts/dev_postgres.sh start
#   ./scripts/dev_postgres.sh stop
#   ./scripts/dev_postgres.sh status
#
# Defaults:
#   data dir: ~/.local/share/autohire/postgres
#   port:     5433
#   user:     autohire
#   password: autohire (dev only)
set -euo pipefail

PGDATA="${AUTOHIRE_PGDATA:-$HOME/.local/share/autohire/postgres}"
PGPORT="${AUTOHIRE_PGPORT:-5433}"
PGUSER="${AUTOHIRE_PGUSER:-autohire}"
PGPASSWORD="${AUTOHIRE_PGPASSWORD:-autohire}"
APP_DB="${AUTOHIRE_APP_DB:-autohire}"
TEST_DB="${AUTOHIRE_TEST_DB:-autohire_test}"

find_bindir() {
  if command -v pg_ctl >/dev/null 2>&1; then
    dirname "$(command -v pg_ctl)"
    return
  fi
  local candidate
  candidate="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
  if [ -z "$candidate" ]; then
    echo "PostgreSQL binaries not found (pg_ctl). Install PostgreSQL 16 first." >&2
    exit 1
  fi
  echo "$candidate"
}

BINDIR="$(find_bindir)"
PGBIN="$BINDIR"

init_cluster() {
  if [ -f "$PGDATA/PG_VERSION" ]; then
    echo "Cluster already exists at $PGDATA"
    return
  fi
  mkdir -p "$PGDATA"
  chmod 700 "$PGDATA"
  local pwfile
  pwfile="$(mktemp)"
  printf '%s\n' "$PGPASSWORD" >"$pwfile"
  "$PGBIN/initdb" \
    -D "$PGDATA" \
    -U "$PGUSER" \
    --pwfile="$pwfile" \
    --auth-local=trust \
    --auth-host=scram-sha-256 >/dev/null
  rm -f "$pwfile"
  echo "Initialised cluster at $PGDATA"
}

is_running() {
  "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" -U "$PGUSER" >/dev/null 2>&1
}

start_cluster() {
  if is_running; then
    echo "PostgreSQL already running on port $PGPORT"
    return
  fi
  "$PGBIN/pg_ctl" \
    -D "$PGDATA" \
    -l "$PGDATA/server.log" \
    -o "-p $PGPORT -k $PGDATA -h 127.0.0.1" \
    start >/dev/null
  for _ in $(seq 1 30); do
    if "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" -U "$PGUSER" >/dev/null 2>&1; then
      break
    fi
    sleep 0.3
  done
  echo "PostgreSQL started on 127.0.0.1:$PGPORT (data: $PGDATA)"
}

create_databases() {
  export PGPASSWORD
  for db in "$APP_DB" "$TEST_DB"; do
    if ! "$PGBIN/psql" -h 127.0.0.1 -p "$PGPORT" -U "$PGUSER" \
      -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" \
      | grep -q 1; then
      "$PGBIN/createdb" -h 127.0.0.1 -p "$PGPORT" -U "$PGUSER" "$db"
      echo "Created database $db"
    else
      echo "Database $db already exists"
    fi
  done
  # btree_gist is needed by the bookings exclusion constraint.
  for db in "$APP_DB" "$TEST_DB"; do
    "$PGBIN/psql" -h 127.0.0.1 -p "$PGPORT" -U "$PGUSER" -d "$db" \
      -c "CREATE EXTENSION IF NOT EXISTS btree_gist" >/dev/null
  done
}

case "${1:-}" in
  init)
    init_cluster
    start_cluster
    create_databases
    ;;
  start)
    [ -f "$PGDATA/PG_VERSION" ] || {
      echo "No cluster at $PGDATA. Run: $0 init" >&2
      exit 1
    }
    start_cluster
    ;;
  stop)
    if is_running; then
      "$PGBIN/pg_ctl" -D "$PGDATA" stop -m fast >/dev/null
      echo "PostgreSQL stopped"
    else
      echo "PostgreSQL is not running"
    fi
    ;;
  status)
    "$PGBIN/pg_ctl" -D "$PGDATA" status || true
    ;;
  *)
    echo "Usage: $0 {init|start|stop|status}" >&2
    exit 2
    ;;
esac
