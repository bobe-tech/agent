#!/usr/bin/env bash
# Applies the numbered migrations from db/migrations/*.sql in order.
# Each applied version is recorded in the schema_migrations table — a repeated
# run applies only new files (idempotent: only new ones are applied).
#
#   ./db/migrate.sh            apply new migrations to ${DB_DATABASE:-bobe_agent}
#   ./db/migrate.sh mydb       to a specific DB
#   ./db/migrate.sh --status   show which migrations are applied, without changing the DB
#
# Constraint: each migration file is applied together with the ledger record in ONE
# transaction (--single-transaction). Therefore inside the files you MUST NOT use
# commands that are not allowed in a transaction block (CREATE INDEX CONCURRENTLY, VACUUM)
# or explicit BEGIN/COMMIT — otherwise the transaction wrapper breaks and the ledger drifts apart from the schema.
set -euo pipefail
shopt -s nullglob   # an empty glob → an empty list, not the literal '*.sql'
DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$(dirname "$DIR")"

# Load DB_* from .env if present
set -a
[ -f "$PROJECT/.env" ] && . "$PROJECT/.env"
set +a

export PGHOST="${DB_HOST:-localhost}"
export PGPORT="${DB_PORT:-5432}"
[ -n "${DB_USERNAME:-}" ] && export PGUSER="$DB_USERNAME"
[ -n "${DB_PASSWORD:-}" ] && export PGPASSWORD="$DB_PASSWORD"

STATUS=0
if [ "${1:-}" = "--status" ]; then STATUS=1; shift; fi
DB="${1:-${DB_DATABASE:-bobe_agent}}"

# Ledger of applied migrations
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c \
  "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());"

if [ "$STATUS" = 1 ]; then
  echo "Applied migrations in DB '$DB':"
  psql -d "$DB" -tA -c "SELECT version || '  (' || applied_at || ')' FROM schema_migrations ORDER BY version;"
  exit 0
fi

files=("$DIR"/migrations/*.sql)
if [ ${#files[@]} -eq 0 ]; then
  echo "no migration files in $DIR/migrations"; exit 0
fi

applied_any=0
for f in "${files[@]}"; do
  version="$(basename "$f" .sql)"
  # We control the migration names ourselves — but we validate to rule out any injection via the file name.
  [[ "$version" =~ ^[0-9A-Za-z._-]+$ ]] || { echo "ERROR: invalid migration name: $version" >&2; exit 1; }
  exists="$(psql -d "$DB" -tA -c "SELECT 1 FROM schema_migrations WHERE version = '$version'")"
  if [ "$exists" = "1" ]; then
    echo "• skip $version (already applied)"
    continue
  fi
  echo "→ applying $version ..."
  # The migration file and the ledger record — in one transaction: all or nothing.
  psql -d "$DB" -v ON_ERROR_STOP=1 --single-transaction \
    -f "$f" \
    -c "INSERT INTO schema_migrations (version) VALUES ('$version');"
  echo "✓ $version applied"
  applied_any=1
done

[ "$applied_any" = 0 ] && echo "✓ DB '$DB' is already up to date — no new migrations" || echo "✓ migrations applied to DB: $DB"
