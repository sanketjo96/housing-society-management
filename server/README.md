# Backend

The backend is organized by business feature. Start in `src/app.ts` to see which
feature routers are mounted.

## Source map

- `src/features/` — routes, controllers, schemas, and services grouped by feature.
- `src/infrastructure/` — Prisma, email, and file-storage adapters.
- `src/shared/` — domain calculations, shared errors, and security helpers.
- `src/middleware/` — cross-feature Express middleware.
- `src/jobs/` — scheduled application jobs.
- `src/config/` — environment/configuration access.
- `prisma/` — schema, migrations, and seed data.

Each request normally flows through `*.route.ts` → `*.controller.ts` → a focused
`*.service.ts`. Request validation lives in `*.schemas.ts` beside its feature.
Compatibility barrel services preserve older imports while focused modules expose
the preferred API for new code.

Tests mirror the same boundaries under `tests/features`, `tests/infrastructure`,
and `tests/shared`.
