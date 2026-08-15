# Oh Heck — agent notes

## Prod

| Piece | Where | URL |
|-------|--------|-----|
| Frontend PWA | GitHub Pages (`o-heck.com`) | http://o-heck.com/ |
| API | Fly.io app `oh-heck-api` region `sjc` | https://oh-heck-api.fly.dev |
| DB | Neon Postgres (`DATABASE_URL` Fly secret) | not public |

Pages build vars (repo Actions): `VITE_API_URL=https://oh-heck-api.fly.dev`, `VITE_BASE=/`.

## Deploy order (always)

Push `main` (or `workflow_dispatch` on `Deploy frontend to GitHub Pages`).
`.github/workflows/deploy-pages.yml` deploys **API first** (Fly `release_command` migrates Neon), then Pages.

Needs repo secret `FLY_API_TOKEN` (Fly deploy token for `oh-heck-api`).

Never apply schema SQL by hand. Never deploy the API without the new `prisma/migrations/` in the image.

## Backend + Neon

CI: `flyctl deploy --remote-only` from `backend/` in the Pages workflow.

Manual:

```bash
cd backend
fly deploy
```

- Builds `backend/Dockerfile` (target `runner`).
- `fly.toml` `[deploy] release_command = "npx prisma migrate deploy"` runs against Neon **before** the new machines take traffic.
- Fly secrets: `DATABASE_URL`, `CORS_ORIGIN`, `COOKIE_SAMESITE`, `COOKIE_SECURE`.
- Health: `GET https://oh-heck-api.fly.dev/health` → `{ ok: true }`.

If migrate fails, Fly aborts the release (old API stays up). Fix the migration; do not `db push` or hand-edit Neon.

Check users / columns after migrate:

```bash
fly ssh console -a oh-heck-api --command "node -e \"const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.findMany({select:{username:true,firstName:true,lastName:true,email:true}}).then(u=>{console.log(JSON.stringify(u,null,2));return p.\\\$disconnect()})\""
```

## Frontend (GitHub Pages)

Same workflow. Pushes to `main`/`master` that touch `frontend/**` or `backend/**` run it.

```bash
git push origin main
gh workflow run "Deploy frontend to GitHub Pages" --repo mrodhansen/oh-heck
```

SPA fallback is `dist/404.html` (copy of `index.html`).

## Local DB

```bash
docker compose up db -d
cd backend && cp -n .env.example .env && npx prisma migrate deploy
```

Postgres is `localhost:5433`. Do not commit `.env`.

## Auth schema (current)

- Register: first name, last name, username, password required; **email optional**.
- After register: only password is mutable (`PATCH /auth/me`).
- Login: username **or** email (`LoginDto.username` is the identifier).
- Email unique when present. Usernames cannot contain `@`.
