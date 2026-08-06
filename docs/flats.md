# Flats — flat & society onboarding

Reference for flat management endpoints, built up through Phase 3. Same route/prefix
convention as `docs/auth.md`: every path below is mounted under `/api/`.

## Create a flat — `POST /api/admin/flats`

Same three-file split as every endpoint since Task 2.1 (see `CLAUDE.md`'s "Backend
architecture"):

- `src/routes/flats.route.ts` — wires the path to the controller, `requireRole(['ADMIN'])`.
- `src/controllers/flats.controller.ts` — Zod-validates the body, calls the service,
  maps its result/errors to an HTTP response.
- `src/services/flats.service.ts` — `createFlat()`/`updateFlat()`, the actual logic. No
  Express types — testable directly (`tests/services/flats.service.test.ts`), not just
  through HTTP (`tests/routes/flats.test.ts`).

Admin-only from day one — unlike `POST /api/admin/users` (Task 2.1), which shipped
without `requireRole` and had it layered on later (Task 2.5), this route has the guard
from the start since `requireRole` already existed by Task 3.1.

**Request body** (validated with Zod):

```json
{
  "block": "string, required",
  "flatNumber": "string, required",
  "baseRate": "number, required, positive",
  "ownerId": "string, required — must be an existing OWNER-role user in the caller's own society"
}
```

`societyId` is **not** a request field — unlike `POST /api/admin/users` (which needs it
in the body because that endpoint predates auth), flats are created by an already
logged-in admin, so `societyId` comes from `req.user.societyId` (the verified JWT,
Task 2.5), the same pattern `admin-users.controller.ts`'s `getUserHandler` uses. A flat
can never be created directly into a society other than the caller's own.

**Response**: `201` with the created flat. `400` on invalid input (Zod failure), *or*
when `ownerId` doesn't resolve to an `OWNER`-role user in the caller's own society —
one error, one status, for "doesn't exist," "belongs to a different society," and
"exists but is a `TENANT`/`ADMIN`, not an `OWNER`" — the service throws
`InvalidOwnerError` (`src/services/flats.service.ts`) for all three, since none of
those are the client's business to distinguish (same non-enumeration spirit as auth's
`InvalidCredentialsError`, `docs/auth.md`). `409` on a duplicate `block`+`flatNumber`
within the same society (`@@unique([societyId, block, flatNumber])`) — the response
names the colliding fields (`"block, flatNumber already in use"`), with `societyId`
filtered out of that list even though it's technically part of the Prisma constraint,
since it's not a field the admin actually submitted as conflicting.

**`DuplicateFieldError` moved to `src/lib/errors.ts`** this task — it originated in
`admin-users.service.ts` (Task 2.1) for the email/phone unique constraint, and is
generic enough (just "these field(s) collided") to reuse here for a different
constraint. `admin-users.service.ts` re-exports it so no existing import broke.

## Edit a flat — `PATCH /api/admin/flats/:id`

Same handler file, `updateFlatHandler`. All body fields are optional (send only what's
changing), but at least one is required (Zod `.refine`). Tenant-scoped: the flat lookup
uses `scopedWhere(req.user.societyId, { id })` (Task 2.6) — a `:id` that exists but
belongs to a different society returns `404`, identical to an `:id` that doesn't exist
at all (verified in `tests/routes/flats.tenant-scope.test.ts`, same pattern as
`tests/routes/admin-users.tenant-scope.test.ts`).

**Request body**: any subset of `block`, `flatNumber`, `baseRate`, `ownerId` (same
validation as create). **Response**: `200` with the updated flat. `404` if `:id`
doesn't exist or belongs to another society. `400` on invalid input or an invalid
`ownerId` (same `InvalidOwnerError` as create). `409` on a `block`+`flatNumber` collision
with another flat in the same society.

## Manually verified against the real running stack

```sh
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sunrise.test","password":"password123"}'
# → { accessToken, user }

curl -X POST http://localhost/api/admin/flats \
  -H "Content-Type: application/json" -H "Authorization: Bearer <accessToken>" \
  -d '{"block":"Z","flatNumber":"999","baseRate":1234,"ownerId":"<alice's user id>"}'
# → 201, the created flat

# same request again → 409 (duplicate block+flatNumber)
# no Authorization header → 401
```

Confirms the full path (nginx → backend → Postgres) works, not just the test suite —
the test row created for this check was deleted afterward, not left in the seed data.

## Not yet built (later Phase 3 tasks)

- `POST /api/admin/flats/:id/tenant` (assign/remove current tenant, with occupancy
  history) — Task 3.2.
- `GET /api/admin/flats` (list) — Task 3.3.
- CSV bulk import — Task 3.4.
- Frontend onboard-flat form and flat list UI — Tasks 3.5/3.6.
