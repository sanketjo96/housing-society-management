# Onboarding — getting the stack running locally

Exact steps to go from a clean checkout to a verified, working local stack. This file
grows through later phases (seed data, auth, the full billing/payment walkthrough) —
right now (end of Phase 0) it covers infra only, since no real features exist yet.

## Prerequisites

- Docker + Docker Compose (`docker --version`, `docker compose version`)
- Node.js v20+ and npm (only needed if you'll run `server/` or `client/` outside
  Docker — the Compose stack itself doesn't need Node on your host)

## 1. Clone and configure environment variables

```sh
git clone <repo-url>
cd smi
cp .env.example .env               # root — read by docker compose itself
cp server/.env.example server/.env # server — only needed for non-Docker local dev
```

Edit both `.env` files and replace the placeholder `POSTGRES_PASSWORD`/`DATABASE_URL`
password with a real value. **These are two separate files with different purposes** —
see `docs/docker-compose.md`'s "Env vars" section if the split is confusing:
root `.env` configures Postgres + is what Docker Compose reads; `server/.env` is only
used if you run the backend directly on your host instead of through Docker.

## 2. Bring up the full stack

```sh
docker compose up -d --build
```

This builds all four service images and starts them. First run pulls base images
(`postgres:16-alpine`, `nginx:1.27-alpine`, `node:20-alpine`) and will take a minute or
two; subsequent runs are much faster thanks to Docker's layer caching.

## 3. Verify it's actually working

Don't just trust that `docker compose up` exited without error — confirm the stack is
correct:

```sh
./scripts/check-stack.sh        # postgres/backend/nginx running, frontend built, / reachable
./scripts/check-nginx-proxy.sh  # / serves frontend, /api/* reaches the backend
curl http://localhost/api/health   # → {"status":"ok"}
```

Or check manually:

```sh
docker compose ps        # postgres, backend, nginx should show "Up ... (healthy)"
docker compose ps -a     # frontend should show "Exited (0)" — this is correct, not a failure (see docs/docker-compose.md)
```

Open `http://<host>/` in a browser — you should see the "Housing Society Management"
placeholder page.

## 4. Running tests

```sh
cd server && npm install && npm test   # backend: Vitest — app skeleton, DB connectivity, health endpoint
cd client && npm install && npm test   # frontend: Vitest + React Testing Library
```

Backend tests need a reachable Postgres — either the Docker Compose one (if `server/.env`
points at `localhost:5432`, which the Compose stack publishes to) or your own local
instance.

## 5. Common gotchas (read before assuming something's broken)

- **`frontend` shows `Exited (0)`, not `Up`** — expected. It's a build-only container;
  see `docs/docker-compose.md`.
- **Edited `nginx/default.conf` but changes don't show up, even after `docker compose
  exec nginx nginx -s reload`** — the bind mount can get stuck on a stale file version
  if the file was replaced (new inode) rather than edited in place. Fix:
  `docker compose up -d --force-recreate nginx`. Full explanation in
  `docs/docker-compose.md`.
- **Edited frontend code but the site doesn't update** — you need `docker compose up -d
  --build` (a full rebuild), not just a restart. The frontend's static files only get
  refreshed when its build-only container re-runs after a rebuild.
- **`DATABASE_URL` "connection refused" when running `npm run dev` in `server/` directly
  on the host** — check `server/.env` exists and has the right host: `localhost`, not
  `postgres` (that hostname only resolves *inside* the Docker network — see
  `docs/database-setup.md`).

## What's running, at a glance

| URL | What |
|---|---|
| `http://<host>/` | Frontend (via nginx) |
| `http://<host>/api/health` | Backend health check (via nginx's `/api/*` proxy) |
| `http://127.0.0.1:3000/api/health` | Backend directly, bypassing nginx (only reachable from the host itself) |
| `http://127.0.0.1:5432` | Postgres directly (only reachable from the host itself) |

Full service breakdown: `docs/docker-compose.md`. Business rules and data model:
`CLAUDE.md`. Task-by-task build progress: `docs/task-status.md`.
