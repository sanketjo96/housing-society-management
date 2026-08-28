# Vehicle Finder — Architecture

## Design Principle
Vehicle Finder is two small, mostly-independent pieces bolted onto the
existing resident self-service pattern: (1) a resident manages their own
`Vehicle` rows, patterned directly on `server/src/features/flats/resident/`
and `/api/me/flat/tenant`'s "act only on your own row, identified from the
JWT" shape; (2) a stateless search endpoint that reads across the whole
society's `Vehicle` rows. Neither piece touches billing, balances, or any
existing model beyond a read of `User`/`Flat` for display and a hook into
tenant-removal for cleanup. Lookups are not logged — see Confirmed Product
Decision #1 in `01-requirements.md`.

## Data Model

```prisma
enum VehicleType {
  TWO_WHEELER
  FOUR_WHEELER
}

// Owned by the User who registered it, not by Flat directly — a vehicle
// must stop surfacing the moment its registrant's tenancy/ownership ends,
// and User already carries that relation to Flat (ownedFlats /
// currentTenantFlats). Deleting the Vehicle row on tenancy-end (R8) is a
// service-level responsibility, not a DB constraint — there is no ON
// DELETE CASCADE from a User's flat relation to a Vehicle, since a User
// row itself is never deleted when a tenancy ends, only detached from the
// Flat.
model Vehicle {
  id          String      @id @default(cuid())
  plateNumber String      // normalized: uppercase, no spaces/punctuation
  type        VehicleType
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  // Denormalized (not reached only via a User→Flat join) for the same
  // reason MaintenanceRecord/LedgerEntry denormalize societyId: the
  // uniqueness constraint and the lookup's scopedWhere() both need it
  // directly on this row, not two joins away.
  societyId String
  society   Society @relation(fields: [societyId], references: [id])

  userId String
  user   User   @relation(fields: [userId], references: [id])

  @@unique([societyId, plateNumber])
  @@index([societyId])
  @@index([userId])
}
```

**Why `userId`, not `flatId`**: mirrors Confirmed Product Decision #3 — a
vehicle's validity is tied to its registrant's current occupancy, not to a
flat directly. Resolving "which flat does this vehicle belong to" at search
time is a join through `user.ownedFlats` / `user.currentTenantFlats`, exactly
as the resident-facing UI already resolves "my flat" today.

**Why `@@unique([societyId, plateNumber])` on the normalized value, not the
raw input**: the same plate typed as `MH12 AB 1234` or `mh-12-ab-1234` must
collide with an existing `MH12AB1234` row — normalization happens once, in a
shared pure function, before either a write or a lookup ever reaches Prisma
(see below), so the constraint itself only ever sees canonical values.

Migration name: `add_vehicle`.

## Plate Normalization

```
server/src/shared/vehicles/normalize-plate.ts
  normalizePlate(raw: string): string
    — uppercase, strip everything except [A-Z0-9]
```

Pure function, no I/O — same shape as `bank-reference-extractor.ts`'s
`extractBankReference`, unit-testable by feeding raw strings directly.
Applied on every write (register) and every read (search), so storage and
lookup always agree on what "the same plate" means.

## Module Layout

```
server/src/features/vehicles/
  resident/
    resident-vehicles.route.ts        POST/GET/DELETE /api/me/vehicles[/:id]
    resident-vehicles.controller.ts
    resident-vehicles.service.ts      register, list-own, delete-own
    resident-vehicles.schemas.ts      Zod: plateNumber, type
    resident-vehicles.openapi.ts
  lookup/
    vehicle-lookup.route.ts           GET /api/vehicles/search?plate=...
    vehicle-lookup.controller.ts
    vehicle-lookup.service.ts         search
    vehicle-lookup.schemas.ts         Zod: plate query param
    vehicle-lookup.openapi.ts
server/src/shared/vehicles/
  normalize-plate.ts
```

Five-file route/controller/service/schemas/openapi split per feature
subfolder, matching every existing feature area's convention. `resident/`
and `lookup/` are separate subfolders (not admin/resident) because neither
endpoint set is admin-only — `lookup/` is reachable by any authenticated
resident or admin, `resident/` is self-service-only (no admin equivalent
needed in v1, since there's no scenario requiring an admin to register a
vehicle on a resident's behalf).

## Request Flow — Register

```
Resident submits plate + type on the "Vehicle Info" tab of My Details
        │
        ▼
POST /api/me/vehicles  { plateNumber, type }
        │
        ▼
resident-vehicles.service.ts:
  - plate = normalizePlate(plateNumber)
  - prisma.vehicle.create({ plateNumber: plate, type, userId: req.user.id, societyId })
      → P2002 (the @@unique([societyId, plateNumber]) constraint) caught via
        getUniqueConstraintFields, rethrown as DuplicateFieldError — the same
        create-and-catch pattern createFeeType already uses, not a separate
        pre-check query
        │
        ▼
201, new Vehicle row (owned by the calling resident)
```

## Request Flow — Delete

```
DELETE /api/me/vehicles/:id
        │
        ▼
resident-vehicles.service.ts's deleteMyVehicle:
  - prisma.vehicle.deleteMany({ where: scopedWhere(societyId, { id, userId }) })
      (userId is the caller's own — from the JWT, never client-suppliable)
  - count === 0 → VehicleNotFoundError (maps to 404) — covers "doesn't exist",
    "wrong society", and "belongs to a different resident" with one error,
    same "one error for every non-owning case" precedent as getOwnFlat
        │
        ▼
204 No Content
```

## Request Flow — Search

```
Resident/admin types a plate into Vehicle Finder
        │
        ▼
GET /api/vehicles/search?plate=MH12AB1234
        │
        ▼
vehicle-lookup.service.ts:
  - plate = normalizePlate(query.plate)
  - vehicle = scopedWhere(societyId, { plateNumber: plate })
      findFirst, include: { user: { include: { ownedFlats, currentTenantFlats } } }
  - resolve the matching flat: user.currentTenantFlats[0] ?? user.ownedFlats[0]
      (a registrant is always either the current tenant or the owner of
      exactly one flat — same resolution the "my flat" resident endpoints
      already do)
        │
        ▼
Hit:  { wing, flatNumber, occupantName, occupantPhone }
Miss: { found: false }
```

No `AuditLog` (or any other record) is written by a search — this endpoint
is a pure read, deliberately, per Confirmed Product Decision #1 in
`01-requirements.md`.

## Tenancy-End Cleanup (R8)

Hooked into every existing call site that ends a tenancy, rather than a new
cron or polling job — there are three, all already-transactional, and each
gained the identical one-line addition:

```ts
prisma.vehicle.deleteMany({ where: { userId: openOccupancy.tenantId } }),
```

added inside the `prisma.$transaction([...])` array alongside the existing
`occupancyChange.update`/`flat.update` pair, in:
- `resident-flats-service.ts`'s `removeOwnTenant` (`DELETE /api/me/flat/tenant`)
- `admin-flats-tenancy-service.ts`'s `removeTenant` (the admin id-based equivalent)
- `flat-shared.ts`'s `applyOccupancy`, in its `occupancy === 'owner'` branch —
  the combined flat-edit form's "revert to owner-occupied" path
  (`PUT /api/me/flat` and the admin's flat-update endpoint both call into
  this shared function), found and hooked after the other two since it's a
  less obvious third path that also ends an open `OccupancyChange`

An owner's vehicles are never cleaned up this way in v1 — an owner's
relation to their flat doesn't end in the same way a tenancy does (there is
no "remove owner" flow in this app; ownership changes are a full flat
reassignment, out of scope for this feature to hook into).

## Frontend Architecture

`MyDetailsPage.tsx` (`client/src/resident/my-details-page/`) gains a second
tab — the page becomes two tabs, **My Info** (today's existing content:
`ProfileSection`/`FlatDetailsSection`/owner-tenant forms, unchanged) and
**Vehicle Info** (new). Vehicle Finder itself (searching *someone else's*
plate) stays a separate standalone page — a different mental model
("manage my own things" vs. "look something up"), not another tab on My
Details.

| Surface | Pattern reused |
|---|---|
| `MyDetailsPage.tsx` — new "Vehicle Info" tab | Simple tab switcher (My Info / Vehicle Info) added around the existing content; the tab's own contents are a small register-form plus `DataTable.tsx` list, same small-form-plus-table pattern as the existing tenant-management section |
| Vehicle Finder page | Standalone page — text input + submit, result card (or "not found"). No table, no filters; the search is a single-value lookup, not a list view |

## OCR Scan-to-Search (R10) — built and rolled back 2026-08-28

**Rolled back the same day it was built** — tested against a real device
photo before shipping any wider, and it failed (see `01-requirements.md`'s
second 2026-08-28 addendum for the concrete failure modes: uncorrected EXIF
rotation, then generic tesseract's `eng` model still not managing a clean
read against India's embossed HSRP plate font even on a correctly-oriented,
hand-cropped plate image). `ocr.ts` and `extract-plate.ts` are deleted, the
scan control is removed from `VehicleFinderPage.tsx`, and `tesseract.js` is
back out of the client's dependencies. The section below is kept as-is,
architecture-as-built, for anyone revisiting this — not as the current state.

Added 2026-08-28, once the user asked for it after using the manual-search
v1 — the exact trigger `05-future-scope.md` had named for its now-removed
"Camera/OCR Plate-Scan Assist" item. Client-side only; no backend change —
`GET /api/vehicles/search` already accepts plain text, so a client-extracted
plate string is indistinguishable from one the resident typed.

```
client/src/resident/vehicle-finder-page/
  ocr.ts             recognizeText(image: File|Blob): Promise<string>
                      — wraps tesseract.js's createWorker/recognize/terminate,
                      never throws (worker-init or unreadable-image failures
                      collapse to '', same silent-failure precedent as
                      server/src/infrastructure/ocr/tesseract-ocr-engine.ts).
                      Sets tessedit_char_whitelist to A-Z0-9 (a plate can't
                      contain anything else) — measured as harmless-to-helpful
                      against synthetic test images. Deliberately does NOT set
                      tessedit_pageseg_mode: PSM.SPARSE_TEXT was tried first
                      (the intuitive choice for "small text region in a busy
                      photo") and measured to actively regress a correct,
                      90%-confidence read down to a blank result on a
                      synthetic plate-in-scene test — reverted in favor of
                      tesseract's default AUTO segmentation, which read the
                      same test image correctly. Any future page-segmentation
                      tuning needs the same kind of empirical before/after
                      check against real device photos, not assumed reasoning
                      about what "should" help.
  extract-plate.ts   extractPlateFromOcrText(text: string): string | null
                      — pure regex match against the standard Indian HSRP
                      shape (2-letter state code, 1-2 digit RTO code, 1-3
                      letter series, 4-digit number), tolerant of dashes/
                      spaces/newlines from OCR noise; same role
                      shared/billing/bank-reference-extractor.ts plays
                      server-side for bank-reference OCR
  VehicleFinderPage.tsx
                     — a camera-icon button inside the search input (a
                       hidden `<input type="file" accept="image/*"
                       capture="environment">`, same mobile-camera-capture
                       mechanism as this app's existing proof-upload flow,
                       not a live video-stream scanner) triggers the file
                       picker; on a file, `recognizeText` → `extractPlate-
                       FromOcrText` runs entirely in-browser
```

**The captured photo never leaves the browser** — no upload, no storage, no
new server endpoint. Only the final plate string (extracted, or manually
typed/edited) is ever sent, to the same `GET /api/vehicles/search` every
other search already used.

**On a successful read**: the search box is prefilled with the extracted
plate and the search runs immediately — an editable suggestion is good
enough to act on here (R10), same trust level bank-reference OCR's pre-fill
gets elsewhere in this app, not something requiring a second confirmation
step.

**On a failed read** (regex finds nothing plate-shaped in the OCR text, or
the OCR call itself fails): an error message is shown, no search runs, and
whatever the resident had already typed into the box is left untouched —
focus simply moves to the box so they can type or correct it. A failed OCR
read and a genuinely bad/unreadable photo are treated identically from the
resident's point of view; there is no separate "OCR crashed" state to
explain.

## Key Architectural Decisions
1. **Vehicle belongs to `User`, not `Flat`.** Correctness of "who does this
   car belong to right now" depends on current occupancy, which lives on
   `User`'s relation to `Flat`, not on a static FK from `Vehicle` to `Flat`
   that would go stale the moment a tenant moves out.
2. **`societyId` is denormalized onto `Vehicle`.** Same tradeoff already
   accepted for `MaintenanceRecord`/`LedgerEntry` — the uniqueness
   constraint and `scopedWhere()` both need it directly on the row.
3. **Normalization is a single shared pure function**, applied identically
   on write and read, so storage and lookup can never silently disagree on
   what counts as "the same plate."
4. **Tenancy-end cleanup is a synchronous delete inside each of the three
   existing tenant-removal transactions**, not a background job — every
   tenancy-end event is already a single explicit service call; there is no
   reason to introduce eventual consistency for a 24-flat app.
