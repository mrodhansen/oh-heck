#!/usr/bin/env bash
# Derive prisma/schema.sqlite.prisma from the canonical Postgres schema and
# generate the client / push the file DB. Used by start:dev:sqlite.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="prisma/schema.prisma"
OUT="prisma/schema.sqlite.prisma"

if [[ ! -f "$SRC" ]]; then
  echo "missing $SRC" >&2
  exit 1
fi

{
  printf '%s\n' '// GENERATED from schema.prisma by scripts/prisma-sqlite.sh — do not edit.'
  sed 's/provider = "postgresql"/provider = "sqlite"/' "$SRC"
} > "$OUT"

if ! grep -q 'provider = "sqlite"' "$OUT"; then
  echo "failed to rewrite datasource provider in $OUT" >&2
  exit 1
fi

case "${DATABASE_URL:-}" in
  file:*|sqlite:*) ;;
  *) export DATABASE_URL="file:./dev.db" ;;
esac

cmd="${1:-push}"
case "$cmd" in
  generate)
    echo "→ Prisma client (sqlite)"
    exec npx prisma generate --schema="$OUT"
    ;;
  push)
    echo "→ Prisma client (sqlite)"
    npx prisma generate --schema="$OUT"
    echo "→ db push ($DATABASE_URL)"
    exec npx prisma db push --schema="$OUT" --skip-generate
    ;;
  *)
    echo "usage: $0 generate|push" >&2
    exit 1
    ;;
esac
