# Oh Heck — agent notes

## Prod

| Piece | Where | URL |
|-------|--------|-----|
| Frontend PWA | GitHub Pages (`o-heck.com`) | http://o-heck.com/ |
| API | Lightsail box + Sablier | https://oh-heck.mrodhansen.com/api |
| DB | SQLite on the box (`/opt/box/data/oh-heck/oh-heck.db`) | not public |

Pages build var: `VITE_API_URL=https://oh-heck.mrodhansen.com/api` (hardcoded in `.github/workflows/deploy-pages.yml`).

## Deploy order (always)

1. API: push `backend/**` (or `workflow_dispatch` on `Deploy API to box`). `.github/workflows/deploy-box.yml` builds `box-oh-heck:latest`, `docker load`s it, recreates **only** `oh-heck`.
2. Frontend: push `frontend/**` (or `workflow_dispatch` on `Deploy frontend to GitHub Pages`).

Needs repo secrets `BOX_SSH_KEY`, `BOX_HOST`, `BOX_USER` (same as mtg-rules).

Never apply schema SQL by hand. Never `docker compose down` the whole box stack (kills Caddy/TLS). Never `down -v` (wipes certs). Never `build --no-cache` on the 1GB box.

## Backend + box

Manual (after a local `linux/amd64` image build):

```bash
cd backend
docker build --platform linux/amd64 --target box -t box-oh-heck:latest .
docker save box-oh-heck:latest | gzip -1 | ssh box "gunzip | docker load"
rsync -az --delete --exclude node_modules --exclude dist --exclude .env --exclude '*.db' \
  ./ backend-check 2>/dev/null || true
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .env --exclude .env.sqlite \
  --exclude '*.db' --exclude '*.db-journal' --exclude prisma/.neon-dump.json \
  ./ ubuntu@54.225.171.58:/opt/box/apps/oh-heck/
ssh box "cd /opt/box && sudo docker compose stop oh-heck && sudo docker compose rm -f oh-heck && sudo docker compose up -d --no-deps --no-build oh-heck"
```

- Compose service `oh-heck` in `/opt/box` (local copy: `~/projects/mrodhansen-box`).
- `restart: "no"` + Sablier group `oh-heck`. Idle stop 1h. `mem_limit: 256m`.
- SQLite file is bind-mounted `./data/oh-heck:/data` → `file:/data/oh-heck.db`.
- Image entrypoint: `prisma db push` (sqlite schema) then `node dist/main.js`.
- Health: `GET https://oh-heck.mrodhansen.com/api/health` → JSON `{ ok: true }`.
- Sablier uses `blocking` (2m) for `/api` and `/socket.io` — no HTML waiting page. Frontend still treats non-JSON / 502–504 as waking and keeps local play.

Caddy: `oh-heck.mrodhansen.com` → strip `/api` → `oh-heck:3000`; `/socket.io` proxied as-is. Do not change caddy/sablier services. Do not orange-cloud DNS. Caddy `admin off` — `caddy reload` fails; after a Caddyfile edit, `sudo docker compose restart caddy` only.

One-time Neon → SQLite (already applied on first box bring-up):

```bash
cd backend
# dump.json from a live Postgres (NEON_DATABASE_URL)
node scripts/neon-to-sqlite.mjs load prisma/.neon-dump.json
# then scp prisma/box-seed.db → /opt/box/data/oh-heck/oh-heck.db with the container stopped
```

Load **fails** if the SQLite file already has users. Do not re-run against prod.

## Frontend (GitHub Pages)

```bash
git push origin main
gh workflow run "Deploy frontend to GitHub Pages" --repo mrodhansen/oh-heck
```

SPA fallback is `dist/404.html` (copy of `index.html`).

## Local DB

Postgres:

```bash
docker compose up db -d
cd backend && cp -n .env.example .env && npx prisma migrate deploy
```

Postgres is `localhost:5433`. Do not commit `.env`.

SQLite (no Docker) — `npm run start:dev:sqlite` rewrites the Prisma provider and `db push`es `backend/prisma/dev.db`:

```bash
cd backend && npm run start:dev:sqlite
```

Do not commit `.env.sqlite` or `prisma/dev.db`. Box prod is SQLite; schema source of truth stays `schema.prisma` (Postgres) + `migrations/`.

## Auth schema (current)

- Register: first name, last name, username, password required; **email optional**.
- After register: only password is mutable (`PATCH /auth/me`).
- Login: username **or** email (`LoginDto.username` is the identifier).
- Email unique when present. Usernames cannot contain `@`.
