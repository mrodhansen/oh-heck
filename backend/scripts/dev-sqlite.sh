#!/usr/bin/env bash
# Lightweight local API: SQLite file DB (no Docker/Postgres).
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
if [[ -f .env.sqlite ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.sqlite
  set +a
fi

# This command always uses SQLite. Ignore a Postgres URL from .env.
case "${DATABASE_URL:-}" in
  file:*|sqlite:*) ;;
  *) DATABASE_URL="file:./dev.db" ;;
esac
# file: URLs are relative to the schema directory (prisma/)
export DATABASE_URL
export PORT="${PORT:-3000}"
export CORS_ORIGIN="${CORS_ORIGIN:-*}"

bash scripts/prisma-sqlite.sh push

echo "→ API on 0.0.0.0:${PORT} (CORS_ORIGIN=${CORS_ORIGIN})"
exec npx nest start --watch
