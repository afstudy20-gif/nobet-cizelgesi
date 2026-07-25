#!/bin/sh

echo "Starting nobet-web (PORT=${PORT:-3100})..."

# Refuse to boot without auth configured. Without these the app would reject
# every request anyway; failing here makes the cause obvious.
if [ -z "$AUTH_SECRET" ] || [ -z "$ADMIN_PASSWORD_HASH" ]; then
  echo "FATAL: AUTH_SECRET and ADMIN_PASSWORD_HASH must be set." >&2
  echo "       Generate them with: pnpm --filter @nobet/web auth:hash \"<password>\"" >&2
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL is not set." >&2
  exit 1
fi

SCHEMA=/app/apps/web/prisma/schema.prisma

# Versioned migrations, applied forward only.
#
# This used to run `prisma db push --accept-data-loss`, which resolves any
# schema drift by dropping whatever does not match — silently, on every single
# boot — and the failure was swallowed so the app started against an unknown
# schema regardless. Both of those are gone: `migrate deploy` never destroys
# data, and a failure here stops the container.
#
# Note: migrations run in the app's own startup, which is only safe because
# this is deployed as a single replica. Running two replicas would have them
# race on `migrate deploy`; move this to a one-shot init job before doing that.
echo "Applying database migrations..."

MIGRATE_LOG=$(mktemp)

# Captured rather than piped: in POSIX sh a pipeline reports the exit status of
# its LAST command, so `prisma ... | tee` would always look like it succeeded.
# The log is echoed either way, so a successful run still shows what it applied.
prisma migrate deploy --schema="$SCHEMA" >"$MIGRATE_LOG" 2>&1
DEPLOY_RC=$?
cat "$MIGRATE_LOG"

if [ "$DEPLOY_RC" -eq 0 ]; then
  echo "Database schema is up to date."
  rm -f "$MIGRATE_LOG"
else
  # P3005: the database has tables but no migration history — i.e. it was
  # created by the old `db push` startup.
  #
  # Baselining is NOT automatic. `migrate resolve --applied` writes a history
  # row without checking anything, so if the database is actually older than
  # 0_init (a restored backup, or a db push from an earlier revision of the
  # schema), it would be recorded as healthy while missing columns. The app
  # would then boot and fail at the first query touching them, with Prisma
  # insisting everything is fine. That has to be a deliberate decision, taken
  # once, by someone who knows what is in the database.
  if grep -q "P3005" "$MIGRATE_LOG"; then
    if [ "$PRISMA_BASELINE_ON_EMPTY_HISTORY" = "1" ]; then
      echo "Baselining existing database at 0_init (PRISMA_BASELINE_ON_EMPTY_HISTORY=1)..."
      rm -f "$MIGRATE_LOG"

      prisma migrate resolve --applied 0_init --schema="$SCHEMA" || {
        echo "FATAL: could not baseline the existing database." >&2
        exit 1
      }
      prisma migrate deploy --schema="$SCHEMA" || {
        echo "FATAL: migrations failed after baselining." >&2
        exit 1
      }
      echo "Database schema is up to date."
    else
      rm -f "$MIGRATE_LOG"
      cat >&2 <<'MSG'
FATAL: the database has tables but no migration history.

This is expected the first time an existing database is switched to versioned
migrations. Confirm its schema matches the one in migrations/0_init, then
start once with:

    PRISMA_BASELINE_ON_EMPTY_HISTORY=1

Do NOT set it if the database might predate 0_init (an old backup, or a
db push from an earlier schema) — baselining does not verify the schema and
would mark a stale database as healthy.
MSG
      exit 1
    fi
  else
    rm -f "$MIGRATE_LOG"
    echo "FATAL: database migrations failed." >&2
    exit 1
  fi
fi

exec node /app/apps/web/server.js