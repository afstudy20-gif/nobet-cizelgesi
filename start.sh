#!/bin/sh

echo "Starting nobet-web (PORT=${PORT:-3100})..."

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