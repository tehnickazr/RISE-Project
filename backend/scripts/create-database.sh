#!/usr/bin/env bash
#
# Create a RISE database from nothing: role, database, schema, demo accounts.
#
#   ./scripts/create-database.sh rise_dev
#   ./scripts/create-database.sh rise2 --owner rise2
#
# Reads nothing from .env — it prints the DATABASE_URL for you to paste in, so
# the same script works for local, staging and a fresh server.
#
# Safe to re-run: it will not drop or overwrite an existing database. Pass
# --force to drop first (asks for confirmation).

set -euo pipefail

DB_NAME="${1:-}"
[ -z "$DB_NAME" ] && { echo "usage: $0 <db-name> [--owner <role>] [--force] [--no-seed]"; exit 1; }
shift

OWNER="$DB_NAME"
FORCE=0
SEED=1
while [ $# -gt 0 ]; do
  case "$1" in
    --owner) OWNER="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    --no-seed) SEED=0; shift ;;
    *) echo "unknown option: $1"; exit 1 ;;
  esac
done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PSQL="psql -v ON_ERROR_STOP=1 -q"

command -v psql >/dev/null || { echo "psql not found on PATH"; exit 1; }

exists() { psql -tAc "SELECT 1 FROM pg_database WHERE datname='$1'" postgres | grep -q 1; }

if exists "$DB_NAME"; then
  if [ "$FORCE" -eq 1 ]; then
    echo "!! Database '$DB_NAME' already exists and --force was given."
    echo "!! This DESTROYS all data in it, including interview transcripts."
    read -r -p "Type the database name to confirm: " confirm
    [ "$confirm" = "$DB_NAME" ] || { echo "aborted"; exit 1; }
    $PSQL postgres -c "DROP DATABASE \"$DB_NAME\";"
    echo "-- dropped $DB_NAME"
  else
    echo "Database '$DB_NAME' already exists. Nothing done."
    echo "Re-run with --force to drop and recreate it."
    exit 0
  fi
fi

# Role. Generated password — never a default, never echoed to a log file.
if psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$OWNER'" postgres | grep -q 1; then
  echo "-- role '$OWNER' already exists, leaving its password alone"
  DB_PASS=""
else
  # No pipeline here — `head` closing early sends SIGPIPE and trips pipefail.
  DB_PASS="$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('base64url'))")"
  $PSQL postgres -c "CREATE ROLE \"$OWNER\" LOGIN PASSWORD '$DB_PASS';"
  echo "-- created role $OWNER"
fi

$PSQL postgres -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$OWNER\";"
echo "-- created database $DB_NAME"

# Keep other databases on a shared host out of reach of this role.
$PSQL postgres -c "REVOKE ALL ON DATABASE \"$DB_NAME\" FROM PUBLIC;" || true
$PSQL postgres -c "GRANT ALL ON DATABASE \"$DB_NAME\" TO \"$OWNER\";"

if [ -n "$DB_PASS" ]; then
  URL="postgresql://$OWNER:$DB_PASS@localhost:5432/$DB_NAME"
else
  URL="postgresql://$OWNER:<existing-password>@localhost:5432/$DB_NAME"
fi

echo
# The frozen schema is the source for a new database; the migrations are this
# project's archaeology and a new adopter has no business replaying them. Where
# schema.sql is absent — an operator checkout mid-change — fall back to the
# migrations so this script still works.
# schema.sql builds the database; migrations/ carries whatever has been added
# since it was frozen. Both, in that order — not one or the other. Today
# migrations/ is empty and the second step does nothing, which is the point:
# the same command keeps working once it is not.
if [ -f "$HERE/schema.sql" ]; then
  echo "-- applying schema.sql"
  psql -v ON_ERROR_STOP=1 -q -d "$URL" -f "$HERE/schema.sql"
  echo "-- schema applied ($(grep -c '^CREATE TABLE' "$HERE/schema.sql") tables)"
else
  echo "!! schema.sql is missing — cannot build a database without it"
  exit 1
fi

echo "-- applying migrations added since the schema was frozen"
( cd "$HERE" && DATABASE_URL="$URL" node src/db/migrate.js )

if [ "$SEED" -eq 1 ]; then
  echo
  echo "-- seeding demo accounts"
  ( cd "$HERE" && DATABASE_URL="$URL" node src/seed.js )
fi

cat <<EOF

============================================================
 Database ready: $DB_NAME

 DATABASE_URL=$URL

 Put that in your .env. The password is shown once and is not
 stored anywhere else — if you lose it, ALTER ROLE to set a new one.
============================================================
EOF
