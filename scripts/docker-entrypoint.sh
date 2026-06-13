#!/bin/sh
# Container entrypoint.
#
# Waits for the database, applies Drizzle migrations, seeds the soccer catalog,
# then execs the Next.js server. Idempotent — re-running the container is safe.

set -e

echo "[touchline] starting (NODE_ENV=${NODE_ENV:-development})"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[touchline] FATAL: DATABASE_URL is not set" >&2
  exit 1
fi

TSX="./node_modules/tsx/dist/cli.mjs"

echo "[touchline] running migrations"
node "$TSX" ./src/db/migrate.ts

echo "[touchline] running soccer seed"
node "$TSX" ./src/db/seed.ts

echo "[touchline] starting server"
exec "$@"
