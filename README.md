# Oh Heck

Mobile-friendly **PWA** scorekeeper + NestJS API + Postgres.

## Stack

- **Frontend:** React + TypeScript (Vite) + Progressive Web App (installable)
- **Offline:** IndexedDB outbox + local game engine; auto-sync when online
- **Backend:** NestJS + **Prisma** + TypeScript
- **DB:** PostgreSQL 16
- **Rules:** `RULES.yaml` / `backend/rules/oh-heck.yaml`

## Architecture (online / offline)

```
UI → api.ts (gateway)
        ├─ online  → flush outbox → HTTP API (Prisma/Postgres)
        └─ offline → IndexedDB cache + outbox queue
                     (optimistic local game state)
window "online" / Sync now → POST /games/sync (bulk ops) → pull fresh data
```

Both the browser tab and the installed PWA use the **same backend** (`VITE_API_URL`).

## Quick start (Docker)

```bash
docker compose up --build
```

- Web: http://localhost:5173
- API: http://localhost:3000 (proxied at `/api` in Docker web)
- Postgres: `localhost:5433`

### Phone on LAN

`http://<mac-lan-ip>:5173` (same Wi‑Fi; allow firewall if needed).

## GitHub Pages (frontend PWA)

1. Host the **API** somewhere public (Fly, Railway, VPS, etc.) with CORS `*`.
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

## Local dev (without Docker for app)

```bash
# DB
docker compose up db -d

# API
cd backend
cp .env.example .env   # if present, or export DATABASE_URL
npm install
npx prisma migrate deploy
npm run start:dev

# Web
cd frontend
export VITE_API_URL=http://localhost:3000
npm install
npm run dev
```

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

See `RULES.yaml` for the full formatted rules.
