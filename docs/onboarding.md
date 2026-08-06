# Onboarding — getting the stack running locally

Exact steps to go from a clean checkout to a verified, working local stack. This file
grows through later phases (auth, the full billing/payment walkthrough) — it currently
covers infra, database setup, and seed data (through end of Phase 1).

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

## 5. Seeding local dev data

```sh
cd server
npx prisma db seed
```

Runs `prisma/seed.ts` against whatever `DATABASE_URL` points to. **Idempotent** —
safe to run repeatedly; if the seed society already exists it logs "already exists,
skipping" and does nothing further, rather than duplicating data.

Creates one society, **"Sunrise Residency"**, with:

| | Count | Details |
|---|---|---|
| Users | 10 | 1 admin, 5 owners, 4 tenants |
| Flats | 5 | A-101, A-102 (owner-occupied, never had a tenant), A-103 (currently tenant-occupied), B-201 (currently tenant-occupied, **with occupancy history** — a prior tenant moved out before the current one moved in), B-202 (currently owner-occupied, but **had** a tenant who moved out) |
| OccupancyChange rows | 4 | Deliberately includes both "still ongoing" (`effectiveEnd: null`) and "ended" (`effectiveEnd` set) rows, and one flat (B-201) with 2 rows — a real mid-history case, not just current state |

**Login for every seeded user**: password `password123` (real bcrypt hash, not a
placeholder — these accounts will actually work once Phase 2's login lands). Emails
follow `<firstname>@sunrise.test`, e.g. `admin@sunrise.test`, `alice@sunrise.test`,
`dave@sunrise.test`. Full list and each flat's owner/tenant mapping: `prisma/seed.ts`.

Why real password hashes now, ahead of Phase 2: this seed data is meant to serve every
later phase's testing, including login — generating it once with real hashes avoids
re-seeding once auth exists.

To reset and reseed from scratch: `npx prisma migrate reset` (interactive — asks for
confirmation, since it wipes the database; **never** run this non-interactively or
against anything other than a local dev database).

## 6. Logging in and what roles unlock which pages (Task 2.8)

Frontend routes are gated by `ProtectedRoute` (`client/src/components/ProtectedRoute.tsx`),
reading auth state from `AuthContext` (`client/src/context/AuthContext.tsx`).

| Route | Who can see it |
|---|---|
| `/login` | Anyone (no auth required) |
| `/dashboard` | Any authenticated user — `ADMIN`, `OWNER`, or `TENANT`; a tabbed page, see below |
| `/` | Redirects to `/dashboard`, which itself redirects to `/login` if you're not signed in |

Task 2.8's original `/admin` demo page (`AdminOnlyPage.tsx`) — a minimal example of
`ProtectedRoute`'s `allowedRoles` — was removed once Task 3.6's "Flats and residents"
tab gave `ADMIN` a real role-gated page to land on instead.

**`/dashboard` is a single tabbed page** (`DashboardPage.tsx`), not a separate route per
feature — which tabs show depends on role, since neither "My details" nor "Flats and
residents" makes sense for every role:

| Tab | Who sees it | Content |
|---|---|---|
| Dashboard | Everyone | Empty placeholder — real widgets are Phase 8 |
| Passbook | `OWNER`, `TENANT` | `MaintenancePage.tsx` — own maintenance records + outstanding total, read-only (payment is Phase 6), Task 4.5/4.7 |
| My details | `OWNER`, `TENANT` | `MyDetailsPage.tsx` — own profile + (owners only) tenant management, Task 3.7/3.8 |
| Flats and residents | `ADMIN` | `FlatsListPage.tsx` — onboard/edit flats, Tasks 3.1–3.6 |

**To try it locally**: bring the stack up (§2), open `http://<host>/`, log in with any
seeded account (§5) — e.g. `admin@sunrise.test` / `password123` to see the "Flats and
residents" tab, or `alice@sunrise.test` / `password123` (an `OWNER`) to see "My
details" instead.

**What happens on page load, before you're redirected anywhere**: `AuthContext` tries
a silent session restore — calls `POST /api/auth/refresh` (using the httpOnly
refresh-token cookie from your last login, if any is still valid) and, if that
succeeds, `GET /api/auth/me` for your profile. `ProtectedRoute` shows "Loading…"
during this brief window rather than redirecting prematurely — so refreshing the page
after logging in keeps you logged in, without the login form flashing first.

**Logging out**: the Dashboard page has a working "Log out" button — calls
`POST /api/auth/logout` (revokes the refresh token server-side), clears local auth
state, and any protected route you're on will redirect to `/login` on its next render.

## 7. Common gotchas (read before assuming something's broken)

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
