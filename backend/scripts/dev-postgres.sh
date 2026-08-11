#!/usr/bin/env bash
# Local API against Postgres (Docker db or any DATABASE_URL).
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://ohheck:ohheck@localhost:5433/ohheck?schema=public}"
export PORT="${PORT:-3000}"
export CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:5173}"

case "$DATABASE_URL" in
  postgresql:*|postgres:*) ;;
  *)
    echo "dev-postgres expects a Postgres DATABASE_URL, got: $DATABASE_URL" >&2
    exit 1
    ;;
esac

echo "→ Prisma client (postgresql)"
npx prisma generate

echo "→ migrate deploy"
npx prisma migrate deploy

echo "→ API on 0.0.0.0:${PORT} (CORS_ORIGIN=${CORS_ORIGIN})"
exec npx nest start --watch
