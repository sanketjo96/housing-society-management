# Complaints — Architecture

## Design Principle
Complaints is a single domain with two coupled audiences, not two
independent pieces like Vehicle Finder's register/search split: the admin
surface (status transitions) directly gates the owner surface (whether
edit/delete is available), so the two sides of this feature read and react
to the same state. It follows the standard admin/resident subfolder split
(`docs/architecture/backend-structure.md`) rather than the "no admin
equivalent needed" shape Vehicle Finder used, because status-change here
genuinely is admin-only.

## Data Model

```prisma
enum ComplaintStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  REJECTED
}

enum ComplaintPriority {
  LOW
  MEDIUM
  HIGH
}

model Complaint {
  id               String            @id @default(cuid())
  title            String
  possibleSolution String
  priority         ComplaintPriority
  status           ComplaintStatus   @default(OPEN)

  // Opaque storage key, not a browsable URL — same StorageAdapter
  // contract as LedgerEntry's fileUrl/mimeType. Served only via an
  // authenticated GET .../:id/image route.
  imageFileKey  String?
  imageMimeType String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Denormalized for the same reason Vehicle denormalizes societyId:
  // scopedWhere() needs it directly on this row, not two joins away.
  societyId String
  society   Society @relation(fields: [societyId], references: [id])

  ownerId String
  owner   User   @relation(fields: [ownerId], references: [id])

  // Captured at creation, not resolved live via owner.ownedFlats — a
  // complaint's flat is a point-in-time fact and must not drift if the
  // owner's flat portfolio later changes.
  flatId String
  flat   Flat   @relation(fields: [flatId], references: [id])

  upvotes ComplaintUpvote[]

  @@index([societyId])
  @@index([ownerId])
  @@index([flatId])
}

model ComplaintUpvote {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  complaintId String
  complaint   Complaint @relation(fields: [complaintId], references: [id])

  ownerId String
  owner   User   @relation(fields: [ownerId], references: [id])

  societyId String
  society   Society @relation(fields: [societyId], references: [id])

  // Toggle idempotency: add an upvote = create a row, remove = delete a
  // row. One owner can hold at most one upvote per complaint.
  @@unique([complaintId, ownerId])
  @@index([societyId])
}
```

**Why `societyId` is denormalized on both models**: same tradeoff already
accepted for `Vehicle`/`MaintenanceRecord`/`LedgerEntry` — `scopedWhere()`
and the `@@unique([complaintId, ownerId])` constraint both need it
directly on the row, not two joins away.

**Why there is no `upvoteCount` column**: matches `CLAUDE.md`'s "balances
and settlement status are derived, never stored" convention. Count comes
from `prisma.complaintUpvote.count({ where: { complaintId } })` at read
time.

**Why `ComplaintUpvote` is a separate model, not a boolean/array on
`Complaint`**: the `@@unique([complaintId, ownerId])` constraint gives
toggle idempotency for free — add = create row, remove = delete row — and
is the natural place to enforce "one upvote per owner per complaint."

**Why `imageFileKey`/`imageMimeType` are inline nullable columns, not a
separate model**: exactly zero or one image per complaint, ever (Confirmed
Product Decision #8) — a join table would only ever have zero or one row
per complaint, buying nothing.

**Why `ownerId` and `flatId` are both stored, not resolved live** (unlike
Vehicle Finder's `user.ownedFlats` live resolution): a complaint's flat is
a historical fact about which flat had the issue, and must stay accurate
even if the owner's flat portfolio changes later — captured once at
creation.

**Prisma gotcha**: `ComplaintUpvote`'s `@@unique([complaintId, ownerId])`
will hit the Prisma 7 + `@prisma/adapter-pg` non-standard unique-constraint
error shape on a duplicate-upvote attempt — use `getUniqueConstraintFields()`
per `docs/architecture/backend-structure.md`, don't re-derive the shape.

Migration name: `add_complaints`.

## Backend Modules

```
server/src/features/complaints/
  admin/
    admin-complaints.route.ts        PATCH /api/admin/complaints/:id/status
                                      GET  /api/admin/complaints/summary
    admin-complaints.controller.ts
    admin-complaints.service.ts      changeStatus, getDashboardSummary
                                      (open count + count per status)
    admin-complaints.schemas.ts      Zod: status enum
    admin-complaints.openapi.ts
  resident/
    resident-complaints.route.ts     POST/GET/PATCH/DELETE /api/complaints[/:id]
                                      POST/DELETE /api/complaints/:id/upvote
                                      GET /api/complaints/:id/image
    resident-complaints.controller.ts
    resident-complaints.service.ts   create, list (society-wide, with
                                      upvote count per row), update, delete,
                                      upvote, unvote
    resident-complaints.schemas.ts   Zod: title, possibleSolution, priority
    resident-complaints.openapi.ts
server/src/shared/complaints/
  complaint-lock.ts                  isEditable(status, upvoteCount): boolean
                                      — pure function, single source of
                                      truth for the lock rule, called from
                                      inside the edit/delete transactions
                                      after re-reading current state
```

## Request Flow — Create

```
Owner submits Title + Possible Solution + Priority (+ optional image)
        │
        ▼
POST /api/complaints  (multipart if image present — multer memory
                        storage + magic-byte sniff, same as every other
                        upload path in this app)
        │
        ▼
resident-complaints.service.ts:
  - resolve ownerId from req.user, flatId from the owner's flat
  - if the image was provided: getStorageAdapter().save({ buffer, societyId, extension })
      → imageFileKey, imageMimeType
  - prisma.$transaction([
      complaint.create({ ...fields, ownerId, flatId, societyId, imageFileKey, imageMimeType }),
      auditLog.create({ action: 'CREATE_COMPLAINT', entityType: 'Complaint', entityId, actorId: ownerId })
    ])
        │
        ▼
201, new Complaint row
```

## Request Flow — Edit/Delete (lock check)

```
PATCH or DELETE /api/complaints/:id
        │
        ▼
resident-complaints.service.ts (inside prisma.$transaction):
  - re-read the complaint's current status via scopedWhere(societyId, { id, ownerId })
      (ownerId in the where clause — an owner can only ever touch their own row;
      count === 0 → ComplaintNotFoundError, same "one error for every non-owning
      case" precedent as getOwnFlat/deleteMyVehicle)
  - upvoteCount = tx.complaintUpvote.count({ where: { complaintId: id } })
  - if !isEditable(complaint.status, upvoteCount): throw ComplaintLockedError (409)
  - else: apply the update/delete + tx.auditLog.create({ action: 'EDIT_COMPLAINT' | 'DELETE_COMPLAINT', ... })
        │
        ▼
200 (edit) or 204 (delete)
```

This re-read-inside-the-transaction shape is what closes the race between
an incoming upvote and an in-flight edit/delete request — the check never
trusts a status/count read earlier in the request lifecycle. Because
`isEditable` is stateless (no `lockedAt` flag), edit/delete rights return
automatically the moment `status === OPEN && upvoteCount === 0` becomes
true again — whether that's from the owner's own edit history, an upvote
being removed, or admin reverting status to Open.

## Request Flow — Upvote Toggle

```
POST /api/complaints/:id/upvote
        │
        ▼
resident-complaints.service.ts:
  - prisma.complaintUpvote.create({ complaintId, ownerId, societyId })
      → P2002 on @@unique([complaintId, ownerId]) caught via
        getUniqueConstraintFields — already-upvoted is a no-op success
        (idempotent), not an error
        │
        ▼
204

DELETE /api/complaints/:id/upvote
        │
        ▼
  - prisma.complaintUpvote.deleteMany({ where: { complaintId, ownerId, societyId } })
      (204 regardless of whether a row existed — idempotent un-vote)
        │
        ▼
204
```

## Request Flow — Admin Status Change

```
PATCH /api/admin/complaints/:id/status  { status }
        │
        ▼
admin-complaints.service.ts:
  - prisma.$transaction([
      complaint.update({ where: scopedWhere(societyId, { id }), data: { status } }),
      auditLog.create({ action: 'CHANGE_COMPLAINT_STATUS', entityType: 'Complaint', entityId, actorId, note: `${from} -> ${to}` })
    ])
      (no restriction on from/to combination — Confirmed Product Decision #5)
        │
        ▼
200
```

## Dashboard Integration

These are extensions to existing endpoints, not a new dashboard feature —
and the two dashboards deliberately show **different shapes of data**, not
the same widget twice:

- **Admin** (`admin-dashboard.service.ts`'s `DashboardSummary`, surfaced on
  `AdminDashboardPage.tsx`): gains **summary cards with counts** — total
  open-complaint count, plus a count per status (Open / In Progress /
  Resolved / Rejected). This is a tile group for an at-a-glance signal,
  not a list.
- **Owner/Resident** (`resident-ledger-service.ts`'s
  `getResidentBalancesSummary`, surfaced on
  `ResidentDashboardOverview.tsx`): gains the **full list of every
  complaint in the society, sorted by upvote count descending** — this is
  the actual ranked browse-and-upvote view, richer than a bare flag,
  living directly on the dashboard rather than requiring a separate page
  visit to see anything.

Both extend their existing endpoint in place rather than introducing a
third dashboard round-trip, consistent with "a service is often callable
from more than one entry point" (`CLAUDE.md`).

## Frontend Architecture

| Surface | Pattern reused |
|---|---|
| Complaints list page (owner-facing, full list + upvote controls) | `DataTable.tsx`, same small-form-plus-table pattern as the Vehicle Info tab |
| Log Complaint form | React Hook Form + Zod, same pattern as every other create form (e.g. Other Charges billing form) |
| Upvote control | Optimistic toggle button inline in the table row |
| Admin status control | Inline `<select>`/dropdown per row on the admin's complaints view, same as other admin status-changing UIs |
| Admin Dashboard complaint cards | `SummaryCard`-style tiles, same component `AdminDashboardPage.tsx` already uses for its other count cards |
| Owner/Resident Dashboard complaint list | Embedded list/table on `ResidentDashboardOverview.tsx`, sorted by upvote count, reusing `DataTable.tsx` |

## Key Architectural Decisions
1. **`ownerId`/`flatId` are captured at creation, not resolved live.**
   Unlike Vehicle Finder's live `user.ownedFlats` resolution, a
   complaint's flat is a historical fact that shouldn't drift if the
   owner's flat portfolio changes later.
2. **The lock check lives in one pure function (`complaint-lock.ts`),
   called from inside the mutating transaction after re-reading current
   state.** One source of truth, deliberately stateless so it self-heals
   if conditions revert — no `lockedAt` flag needed.
3. **No `upvoteCount` column** — consistent with the app's broader
   "derived, never stored" rule for anything computed from other rows.
4. **Dashboard integration extends existing endpoints, and intentionally
   renders different shapes for admin vs. owner** — count cards for
   admin, the full ranked list for owners — rather than reusing one
   widget for both audiences.
5. **Admin status transitions are unrestricted** (any state to any
   state) — deliberately no state-machine library or transition-guard
   table, since the product decision is "admin can do this at any time."
