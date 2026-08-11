#!/usr/bin/env bash
# Lightweight local API: SQLite file DB (no Docker/Postgres).
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env.sqlite ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.sqlite
  set +a
elif [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# file: URLs are relative to the schema directory (prisma/)
export DATABASE_URL="${DATABASE_URL:-file:./dev.db}"
export PORT="${PORT:-3000}"
export CORS_ORIGIN="${CORS_ORIGIN:-*}"

case "$DATABASE_URL" in
  file:*|sqlite:*) ;;
  *)
    echo "dev-sqlite expects a SQLite DATABASE_URL (file:...), got: $DATABASE_URL" >&2
    echo "Use .env.sqlite or unset DATABASE_URL." >&2
    exit 1
    ;;
esac

echo "→ Prisma client (sqlite)"
npx prisma generate --schema=prisma/schema.sqlite.prisma

echo "→ db push ($DATABASE_URL)"
npx prisma db push --schema=prisma/schema.sqlite.prisma

echo "→ API on 0.0.0.0:${PORT} (CORS_ORIGIN=${CORS_ORIGIN})"
exec npx nest start --watch
