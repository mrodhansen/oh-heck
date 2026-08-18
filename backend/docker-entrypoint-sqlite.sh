#!/bin/sh
# Box / local SQLite: push schema onto the file DB, then start the API.
set -eu

export DATABASE_URL="${DATABASE_URL:-file:/data/oh-heck.db}"

case "$DATABASE_URL" in
  file:*|sqlite:*) ;;
  *)
    echo "sqlite entrypoint expects a SQLite DATABASE_URL (file:...), got a different scheme" >&2
    exit 1
    ;;
esac

if [ ! -f prisma/schema.sqlite.prisma ]; then
  echo "missing prisma/schema.sqlite.prisma (image must be built with the box target)" >&2
  exit 1
fi

echo "→ prisma db push ($DATABASE_URL)"
npx prisma db push --schema=prisma/schema.sqlite.prisma --skip-generate

echo "→ API on 0.0.0.0:${PORT:-3000}"
exec node dist/main.js
