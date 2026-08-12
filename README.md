# Oh Heck

Mobile-friendly **PWA** scorekeeper + NestJS API + Postgres (or SQLite for light local).

## Stack

- **Frontend:** React + TypeScript (Vite) + Progressive Web App (installable)
- **Offline:** IndexedDB outbox + local game engine; auto-sync when online
- **Backend:** NestJS + **Prisma** + TypeScript
- **DB:** PostgreSQL 16 (Docker / prod) **or** SQLite file (no Docker)
- **Rules:** in-app How to Play · `RULES.yaml` / `backend/rules/oh-heck.yaml`
- **Technical spec:** `docs/RULES.technical.yaml`

## Architecture (online / offline)

```
UI → api.ts (gateway)
        ├─ online  → flush outbox → HTTP API (Prisma)
        └─ offline → IndexedDB cache + outbox queue
                     (optimistic local game state)
window "online" / Sync now → POST /games/sync (bulk ops) → pull fresh data
```

Both the browser tab and the installed PWA use the **same backend** (`VITE_API_URL`).

## Two ways to run

| Mode | Command | DB | When |
|------|---------|----|------|
| **Full Docker** | `docker compose up --build` | Postgres container | Closest to prod, all-in-one |
| **SQLite local** | `npm run start:dev:sqlite` (backend) | `prisma/dev.db` | Mac mini / no Docker stack |
| **Postgres local** | `docker compose up db -d` + `npm run start:dev:postgres` | Postgres only | App on host, DB in Docker |

Docker is unchanged. SQLite is an extra local path — not a replacement for compose/prod.

---

### 1) Full Docker

```bash
docker compose up --build
```

- Web: http://localhost:5173
- API: http://localhost:3000 (proxied at `/api` in Docker web)
- Postgres: `localhost:5433`

Phone on LAN: `http://<mac-lan-ip>:5173` (same Wi‑Fi; allow firewall if needed).

---

### 2) Lightweight: API + SQLite (no Docker)

```bash
cd backend
cp .env.sqlite.example .env.sqlite   # optional
npm install
npm run start:dev:sqlite
```

- Creates/updates `backend/prisma/dev.db` via `prisma db push` (`file:./dev.db` is relative to the schema dir)
- Listens on `0.0.0.0:3000`, `CORS_ORIGIN=*` by default
- Regenerates the Prisma client for **sqlite** (switch back with `npm run prisma:generate` before Postgres/Docker builds)

Frontend (optional, separate terminal):

```bash
cd frontend
export VITE_API_URL=http://localhost:3000
npm install
npm run dev
```

#### Mac mini + ngrok

```bash
# terminal 1 — API + SQLite
cd backend && npm run start:dev:sqlite

# terminal 2 — public tunnel to the API
ngrok http 3000
```

Point the PWA / GitHub Pages build at the ngrok HTTPS URL:

```bash
# frontend build or local dev
export VITE_API_URL=https://YOUR_SUBDOMAIN.ngrok-free.app
```

Notes:

- Backend already allows the `ngrok-skip-browser-warning` header; the frontend sends it when `VITE_API_URL` contains `ngrok`.
- Free ngrok URLs change on restart — update `VITE_API_URL` (or a Pages secret) when they do.
- For Socket.IO realtime through ngrok, use the same HTTPS base (no extra path).

---

### 3) Local app + Docker Postgres only

```bash
docker compose up db -d

cd backend
cp .env.example .env
npm install
npm run start:dev:postgres

cd frontend
export VITE_API_URL=http://localhost:3000
npm install
npm run dev
```

---

## GitHub Pages (frontend PWA)

1. Host the **API** somewhere public (Fly, Railway, VPS, Mac mini + ngrok, etc.) with CORS `*`.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. Set Actions variable/secret:
   - `VITE_API_URL` = `https://your-api.example.com` (no trailing slash)
   - optional `VITE_BASE` = `/oh-heck/` (defaults to `/<repo>/`)
4. Push to `main` — workflow `.github/workflows/deploy-pages.yml` builds & deploys.
5. Open the Pages URL → **Add to Home Screen** for the PWA.

### Local PWA build

```bash
cd frontend
VITE_API_URL=https://your-api.example.com VITE_BASE=/ npm run build
npx vite preview
```

## Prisma / schema notes

- **Postgres (canonical):** `backend/prisma/schema.prisma` + `migrations/` → `prisma migrate deploy`
- **SQLite (local only):** `backend/prisma/schema.sqlite.prisma` → `prisma db push` (no shared migrate history)
- Keep the two schema files in sync (models identical; only `provider` differs)
- After SQLite dev, run `npm run prisma:generate` before Docker image builds if you stay on the same machine

## Game flow

1. **New game** — enter 2–7 player names in seat order  
   - First name = left of dealer (bids first in round 1)  
   - Last name = round-1 dealer (bids last, restricted bid)
2. Each of **13 rounds** (hands `7→1→7`): enter bids → enter tricks → auto-score
3. **Board** tab — full scoreboard; **Edit** any completed/current round
4. **Stats** — wins, avg score, bid accuracy, nils, over/undertricks, best/worst rounds (by player name)

## Scoring (summary)

| Result | Points |
|--------|--------|
| Bid made exactly | `5 + tricks` |
| Missed | `-|bid − tricks|` |

Last bidder may not make `sum(bids) === hand size`. Tricks must sum to hand size.

See the in-app **Rules** page (or `RULES.yaml`) for the how-to-play.
The original machine-oriented spec is in `docs/RULES.technical.yaml`.
