#!/bin/sh

echo "Starting nobet-web (PORT=${PORT:-3100})..."

# Refuse to boot without auth configured. Without these the app would reject
# every request anyway; failing here makes the cause obvious.
if [ -z "$AUTH_SECRET" ] || [ -z "$ADMIN_PASSWORD_HASH" ]; then
  echo "FATAL: AUTH_SECRET and ADMIN_PASSWORD_HASH must be set." >&2
  echo "       Generate them with: pnpm --filter @nobet/web auth:hash \"<password>\"" >&2
  exit 1
fi

if [ -n "$DATABASE_URL" ]; then
  echo "Running database migrations..."
  if prisma db push --schema=/app/apps/web/prisma/schema.prisma --accept-data-loss --skip-generate; then
    echo "Database schema is up to date."
  else
    echo "WARNING: database migration failed; starting app anyway."
  fi
else
  echo "WARNING: DATABASE_URL is not set; skipping database migration."
fi

exec node /app/apps/web/server.js