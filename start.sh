#!/bin/sh
set -e

echo "Running database migrations..."
prisma db push --schema=/app/apps/web/prisma/schema.prisma --accept-data-loss

echo "Starting Next.js..."
exec node /app/apps/web/server.js
