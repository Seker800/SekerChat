#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS}" = "true" ]; then
  PRISMA=""
  if [ -x ./node_modules/.bin/prisma ]; then
    PRISMA="./node_modules/.bin/prisma"
  elif [ -x ./apps/backend/node_modules/.bin/prisma ]; then
    PRISMA="./apps/backend/node_modules/.bin/prisma"
  fi

  if [ -n "$PRISMA" ]; then
    echo "Running Prisma migrations..."
    $PRISMA migrate deploy --schema prisma/schema.prisma || echo "Migration failed, continuing anyway..."
  fi
fi

echo "Starting backend..."
exec node dist/src/main.js
