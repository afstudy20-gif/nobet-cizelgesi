#!/bin/sh
set -e

echo "Running database migrations..."
prisma migrate deploy --schema=/app/apps/web/prisma/schema.prisma

echo "Starting Next.js..."
exec node /app/apps/web/server.js
