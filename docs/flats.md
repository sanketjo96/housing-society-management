# Flats — flat & society onboarding

Reference for flat management endpoints, built up through Phase 3. Same route/prefix
convention as `docs/auth.md`: every path below is mounted under `/api/`.

**Every endpoint under `/api/admin/*` is admin-only.** `wing` and `flatNumber` are
permanently immutable once a flat exists (Task 3.1: never editable, not even by an
admin — see "Edit a flat" below). Owner/tenant *contact details* (name/phone/email),
by contrast, are editable by both an admin (via these endpoints) and, since Task 3.7,
by the resident themselves (`/api/me/flat*`, documented at the bottom of this page and
in `docs/auth.md`).

## Redesign (2026-08-06): owner/tenant are contact fields, not ids

Tasks 3.1/3.2 originally required `ownerId`/`tenantId` referencing an **already
existing** User account, created via a separate `POST /api/admin/users` call first.
Confirmed against a shared admin-view UI mockup (`AdminExperience`'s "Flats and
residents" tab): the real admin workflow is **one form** — wing, flat number, base
rate, owner contact, occupancy, tenant contact — saved together in one action, with no
separate "create the account first" step. `createFlat`/`updateFlat`
(`src/services/flats.service.ts`) were redesigned to match: they take owner/tenant
**contact fields** (`name`/`phone`/`email`) and find-or-create the underlying `User`
accounts inline, via a new shared helper, `findOrCreateUserByEmail()`:

- **Email found, matching role** → updates that user's `name`/`phone` in place (an
  admin re-onboarding the same flat, or fixing a typo, doesn't create a duplicate).
- **Email found, different role** → throws `ConflictingRoleError` (`409`) — one email
  can't be an `OWNER` in one flat and, say, a `TENANT` in another; the schema has no
  concept of a person holding two roles.
- **Email not found** → creates a real account immediately, given a random unusable
  password, then calls the *same* `requestPasswordReset()` Task 2.4 already built
  (currently stubbed to log the reset link — Phase 7 replaces the stub with a real
  send). The person sets their own password via that link and logs in normally
  afterward — no separate invite-token subsystem, just two already-built pieces wired
  together. See `docs/auth.md` for the fuller version of this reasoning (it was first
  established for Task 3.7's resident self-service, then reused here for symmetry).

This was a genuine breaking change to Task 3.1's already-shipped contract and docs —
confirmed with the project owner before making it, given `CLAUDE.md`'s "do not deviate
[from established business rules] without confirming."

`InvalidOwnerError` (the old "ownerId must reference an existing OWNER" error) no
longer exists — there's no separate id to validate anymore.

## Create a flat — `POST /api/admin/flats`

Same three-file split as every endpoint since Task 2.1 (see `CLAUDE.md`'s "Backend
architecture"):

- `src/routes/flats.route.ts` — wires the path to the controller, `requireRole(['ADMIN'])`.
- `src/controllers/flats.controller.ts` — Zod-validates the body, calls the service,
  maps its result/errors to an HTTP response.
- `src/services/flats.service.ts` — `createFlat()`/`updateFlat()`, the actual logic. No
  Express types — testable directly (`tests/services/flats.service.test.ts`), not just
  through HTTP (`tests/routes/flats.test.ts`).

**Request body** (validated with Zod):

```json
{
  "wing": "string, required",
  "flatNumber": "string, required",
  "baseRate": "number, required, positive",
  "ownerName": "string, required",
  "ownerPhone": "string, optional",
  "ownerEmail": "string, required, valid email",
  "occupancy": "'owner' | 'tenant', optional (default owner-occupied)",
  "tenantName": "string, required if occupancy is 'tenant'",
  "tenantPhone": "string, optional",
  "tenantEmail": "string, required if occupancy is 'tenant', valid email",
  "effectiveFrom": "date, optional — defaults to now if a tenant is being assigned"
}
```

`societyId` is **not** a request field — flats are created by an already logged-in
admin, so it comes from `req.user.societyId` (the verified JWT, Task 2.5). A flat can
never be created directly into a society other than the caller's own.

**Response**: `201` with the created flat, including `owner` and `currentTenant`
summaries (`{ id, name, email, phone }` each). `400` on invalid input (Zod failure).
`409` on a duplicate `wing`+`flatNumber` within the same society
(`@@unique([societyId, wing, flatNumber])` — the response names the colliding fields,
`societyId` filtered out even though it's technically part of the constraint, since
it's not a field the admin submitted), *or* `ConflictingRoleError` if `ownerEmail`/
`tenantEmail` already belongs to a same-society user under a different role.

**`DuplicateFieldError` lives in `src/lib/errors.ts`** (moved there in Task 3.1) — it
originated in `admin-users.service.ts` (Task 2.1) for the email/phone unique
constraint, and is generic enough to reuse for the flat's `wing`+`flatNumber`
constraint too. `admin-users.service.ts` re-exports it so no existing import broke.

## Edit a flat — `PATCH /api/admin/flats/:id`

Same handler file, `updateFlatHandler`. Tenant-scoped: the flat lookup uses
`scopedWhere(req.user.societyId, { id })` (Task 2.6) — a `:id` that exists but belongs
to a different society returns `404`, identical to an `:id` that doesn't exist at all.

**Request body**: any subset of `baseRate`, `ownerName`, `ownerPhone`, `ownerEmail`,
`occupancy`, `tenantName`, `tenantPhone`, `tenantEmail`, `effectiveFrom`. **`wing` and
`flatNumber` are not accepted here at all** — a flat's identity is fixed at creation
(matches the admin UI mockup's disabled wing/flat-number inputs on the edit form).
Setting `occupancy: 'tenant'` with tenant fields **updates the existing tenant's
contact info in place** if the flat already has one (rather than rejecting, the way the
id-based `assignTenant`/Task 3.2 does) — or creates a new tenant account if none
exists yet. Setting `occupancy: 'owner'` closes any open `OccupancyChange`, reverting
to owner-occupied.

**Response**: `200` with the updated flat. `404` if `:id` doesn't exist or belongs to
another society. `400` on invalid input. `409` on a `wing`+`flatNumber` collision
(only reachable if `baseRate`'s update path somehow collided — in practice this can't
happen anymore since wing/flatNumber aren't editable) or `ConflictingRoleError`.

## Assign a tenant (admin, id-based) — `POST /api/admin/flats/:id/tenant`

Task 3.2. A lower-level, still-supported alternative to setting `occupancy: 'tenant'`
on `PATCH` above — takes an existing `tenantId` directly rather than contact fields,
useful when the tenant's account already exists and the admin just wants to link them
to this flat without re-typing their details.
`assignTenant()`/`removeTenant()` in `flats.service.ts`, `assignTenantHandler`/
`removeTenantHandler` in `flats.controller.ts`. Opens a new `OccupancyChange` row
(`tenantId` set, `effectiveStart` = now, `effectiveEnd` = `null`) and syncs the
denormalized `Flat.currentTenantId` in the same `prisma.$transaction`.

**Request body**: `{ "tenantId": "string, required — must be an existing TENANT-role
user in the caller's own society" }`. **Response**: `200` with the updated flat.

**`400`** if `tenantId` doesn't resolve to a `TENANT` in the caller's own society
(`InvalidTenantError`). **`404`** if `:id` doesn't exist or belongs to another society.

**`409`** (`TenantAlreadyAssignedError`) if the flat already has an open
`OccupancyChange` row — **deliberately rejects rather than swapping**, unlike
`PATCH .../:id`'s upsert-in-place behavior above. `DELETE .../tenant` must be called
first for this id-based path specifically.

## Remove the current tenant (admin, id-based) — `DELETE /api/admin/flats/:id/tenant`

Closes the flat's open `OccupancyChange` row (`effectiveEnd` = now) and clears
`Flat.currentTenantId` back to `null`. **Response**: `200` with the updated flat
(`currentTenantId: null`). **`404`** same tenant-scoping rule as above. **`409`**
(`NoCurrentTenantError`) if the flat is already owner-occupied.

## List flats — `GET /api/admin/flats`

Task 3.3. Returns every flat in the caller's society, sorted by `wing` then
`flatNumber`, each including `owner`/`currentTenant` summaries (one query, no N+1) —
backs the admin "Flats and residents" list view.

## Bulk import — `POST /api/admin/flats/import`

Task 3.4. Body: `{ "csv": "string" }` — CSV text (not a file upload; the frontend
reads the file client-side and posts its text content). Hand-rolled parsing, no
library — the expected fields never contain commas/quotes, so an RFC 4180 parser isn't
needed for this MVP's actual data. Column-name-based (case-insensitive, any order):
`wing`, `flatNumber`, `ownerName`, `ownerEmail` required; `baseRate`, `ownerPhone`,
`occupancy`, `tenantName`, `tenantPhone`, `tenantEmail`, `effectiveFrom` optional. A
row that omits `baseRate` inherits `Society.defaultBaseRate`, the same fallback the
admin UI already uses when onboarding a single new flat (2026-08-06 addendum) — kept
consistent rather than inventing a second default mechanism just for CSV rows. Each
row onboards a flat exactly the way the admin form does (same `createFlat()` call) —
per-row failures are collected into an `errors` array rather than aborting the whole
batch, so one bad row doesn't block the rest.

**Response**: always `200` (given valid Zod input) with
`{ created: Flat[], errors: { row: number, message: string }[] }`. `400` only for an
empty `csv` field.

## Resident self-service (Task 3.7) — not under `/api/admin`

Confirmed against a shared resident-view UI mockup: an `OWNER`/`TENANT` may update
their own profile directly, and an `OWNER` may manage their own flat's tenant, without
admin involvement. See `CLAUDE.md`'s "Addition (2026-08-06)" for the full reasoning and
`docs/auth.md` for the endpoint reference (`PATCH /api/me`, `GET /api/me/flat`,
`PUT`/`DELETE /api/me/flat/tenant`) — documented there since it's not `/admin`-scoped.
The `PUT` upserts the tenant in place (same semantics as `PATCH /api/admin/flats/:id`'s
`occupancy: 'tenant'`, not the id-based `assignTenant`'s reject-on-existing behavior).

## Frontend (Tasks 3.5/3.6) — `client/src/pages/admin/FlatsListPage.tsx`

Not a standalone route — rendered as the "Flats and residents" tab inside
`DashboardPage.tsx` (`/dashboard`), shown only to `ADMIN` (`docs/onboarding.md`'s
routing table). One component handles both list and onboard/edit, matching the admin
mockup's list ↔ inline-form pattern: the list view and the onboard/edit form
(`FlatForm`) are two states of the same component, toggled locally — clicking "Onboard
a flat" or a row's "Edit" swaps the list for the form; "Back to list" swaps back.
`wing`/`flatNumber` render as
disabled inputs in edit mode (matches the backend's "not editable after creation"
rule), and are ordinary text inputs in create mode. The occupancy toggle
(owner-occupied / tenant-occupied) reveals/hides the tenant sub-form, matching the
mockup's interaction exactly. CSV import is a panel on the list view, matching the
mockup's file-picker pattern exactly (not a textarea): a hidden `<input
type="file" accept=".csv">` triggered by a visible "Import CSV" button, plus a
"Download template" button that generates a one-row example CSV client-side (`Blob` +
a temporary `<a download>`, no server round-trip). The uploaded file's text is read
client-side (`File.text()`) and posted as-is to the same `{ csv: string }` body the
backend already expected — only the UI interaction changed, not the request contract.
Shows a created-count and a per-row error list from the response.

**Known simplifications vs. the full mockup** (which includes Dashboard, Pending
review, and Settings tabs beyond "Flats and residents"): only the flats/residents
management surface was built — the other three tabs depend on entities/endpoints from
later phases (`MaintenanceRecord` for Dashboard/Settings' rate preview, `PaymentProof`
for Pending review) that don't exist yet. The mockup's decorative floor/unit sidebar
widget (`FacadeMini`) was also not ported — it's a fixed illustrative floor plan
(6 floors × 4 units) that doesn't correspond to this app's actual `wing`/`flatNumber`
scheme (arbitrary admin-chosen strings, not a numeric grid), and Excel-export /
CSV-template-download buttons were skipped since they'd need new dependencies
(`xlsx`, `papaparse`) not otherwise justified by Phase 3's scope.

## Manually verified against the real running stack

```sh
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sunrise.test","password":"password123"}'
# → { accessToken, user }

curl -X POST http://localhost/api/admin/flats \
  -H "Content-Type: application/json" -H "Authorization: Bearer <accessToken>" \
  -d '{"wing":"Z","flatNumber":"999","baseRate":1234,"ownerName":"Live Test Owner","ownerEmail":"livetest-owner@example.com","occupancy":"tenant","tenantName":"Live Test Tenant","tenantEmail":"livetest-tenant@example.com"}'
# → 201, the created flat, owner + tenant accounts both provisioned inline

curl http://localhost/api/admin/flats -H "Authorization: Bearer <accessToken>"
# → 200, includes the flat above with owner/currentTenant summaries
```

Confirms the full path (nginx → backend → Postgres) works, not just the test suite —
every row created for this check was deleted afterward, not left mutating the seed
data.

## Not yet built (later Phase 3 tasks)

None remaining — Phase 3 (3.1–3.8) is complete. Phase 4 (maintenance records) is next.
