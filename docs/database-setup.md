# Database setup

Prisma 7 + PostgreSQL, wired up with no models yet (schema comes in Phase 1).

## Env vars

| Var | Purpose | Example |
|---|---|---|
| `DATABASE_URL` | Postgres connection string, read by both the driver adapter at runtime and the Prisma CLI (via `prisma.config.ts`) | `postgresql://smi:smi_dev_password@localhost:5432/smi_dev?schema=public` |

Set in `server/.env` (gitignored). `.env.example` documenting every env var used so far
gets added in Task 0.6, once the health-check task has a full picture of what's needed.

## Local dev database

Task 0.4 will define the real `docker-compose.yml` Postgres service. Until then, a
throwaway container works for local dev/testing, bound to loopback only (never exposed
publicly — unlike the frontend dev server, a database has no reason to be
internet-reachable):

```sh
docker run -d --name smi-dev-postgres \
  -e POSTGRES_USER=smi \
  -e POSTGRES_PASSWORD=smi_dev_password \
  -e POSTGRES_DB=smi_dev \
  -p 127.0.0.1:5432:5432 \
  postgres:16-alpine
```

## Running Prisma commands

```sh
cd server
npx prisma generate       # regenerate the client after any schema.prisma change
npx prisma migrate dev    # create + apply a migration (Phase 1 onward, once models exist)
npx prisma studio         # visual DB browser
```

## Prisma 7 — what's different from earlier versions (read this before touching schema.prisma)

This project started on **Prisma 7**, which changed enough from Prisma 5/6 that old
tutorials/muscle memory will mislead you:

1. **Config lives in `prisma.config.ts`, not just `schema.prisma`.** `prisma init`
   generated `server/prisma.config.ts`, which points at the schema path and reads
   `DATABASE_URL` (via an explicit `import "dotenv/config"` — Prisma does **not**
   auto-load `.env` files anymore, unlike v5/v6).

2. **The generated client is TypeScript source in your repo, not a compiled
   `node_modules` package.** `schema.prisma`'s generator block outputs to
   `src/generated/prisma/` (gitignored — see `server/.gitignore`). Regenerate with
   `npx prisma generate` any time the schema changes.

3. **Import from `./generated/prisma/client`, not the directory root.** The generated
   directory has no root `index`; `PrismaClient` lives in `client.ts`. Importing the bare
   directory path fails — this bit us during Task 0.3 (see `src/db.ts`).

4. **Driver adapters are mandatory for SQL databases — there's no bundled query engine
   binary anymore.** You must construct an adapter (`@prisma/adapter-pg` + `pg` for
   Postgres, installed as real dependencies) and pass it to `PrismaClient`:

   ```ts
   import { PrismaClient } from './generated/prisma/client';
   import { PrismaPg } from '@prisma/adapter-pg';

   const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
   export const prisma = new PrismaClient({ adapter });
   ```

   This is `server/src/db.ts` — the shared Prisma client every module should import from.
   Do not construct a second `PrismaClient` elsewhere.

5. **`$connect()` does not prove the database is reachable.** With driver adapters,
   `$connect()` resolves lazily/eagerly regardless of whether Postgres is actually up —
   we hit this directly writing Task 0.3's test (it passed with the DB container
   stopped). **To actually test connectivity, run a real query** — the test in
   `tests/db.test.ts` uses `prisma.$queryRaw\`SELECT 1\`` instead.

## Testing against the database

`server/vitest.config.ts` loads `tests/setup.ts`, which does `import 'dotenv/config'` so
`DATABASE_URL` is available in the test process (Vitest doesn't load `.env` on its own).

## Addendum (2026-08-21): `DATABASE_URL` must point at a database separate from the deployed app's

The example above (and `.env.example`, before this date) used `smi_dev` for both the
local host database *and* the name `docker-compose.yml` gives the deployed app's
Postgres database. That was harmless while this was purely a local dev database with
no real users — it stopped being harmless the moment `docker compose up` on the VPS
started serving real pilot traffic against a `smi_dev` database on the same Postgres
instance/port that `server/.env` (read by `npm test`/`npm run dev` on that same host)
also pointed at. Confirmed concretely: two stray `Society`/`User` rows were found in
the live pilot's `smi_dev`, traced to a `flats-tenant.service.test.ts` run that got
killed mid-suite before its `afterAll` cleanup could run — proof this was live risk,
not theoretical (nothing in the test suite does an *unscoped* delete/truncate, so this
couldn't have wiped real data outright, but an interrupted or slightly-less-careful
future test absolutely could have).

**Fix**: a second database, `smi_test`, in the same Postgres container — no second
container needed, no docker-compose.yml change needed (the deployed app's own
`DATABASE_URL` is set directly in that file's `environment:` block, pointing at
`postgres:5432/smi_dev` over Docker's internal network; it never reads `server/.env`
at all). `server/.env`/`server/.env.example` now default to `smi_test`. To set this
up on a fresh checkout or a new VPS:

```sh
docker compose exec postgres psql -U smi -d smi_dev -c "CREATE DATABASE smi_test OWNER smi;"
cd server
DATABASE_URL="postgresql://smi:smi_dev_password@localhost:5432/smi_test?schema=public" npx prisma migrate deploy
```

Then point `server/.env`'s `DATABASE_URL` at `smi_test` instead of `smi_dev`. Verify
isolation actually holds by checking row counts in `smi_dev` before/after a full
`npx vitest run` — they should not move.
