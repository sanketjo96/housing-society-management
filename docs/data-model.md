# Data model

Reference for the database schema, built up phase by phase. Each Phase 1 task appends
its own models here. Source of truth is `server/prisma/schema.prisma`; this doc explains
the *why* behind it, not just the *what*.

## Society

The root tenant entity. Everything else in the system — flats, users, maintenance
records — belongs to exactly one society. This MVP only ever has one row here (see
`CLAUDE.md`'s scope notes), but every other model is scoped by `societyId` from day one
so a second society could be onboarded later without a schema rewrite.

```prisma
model Society {
  id               String   @id @default(cuid())
  name             String
  address          String
  upiVpa           String
  tenantRateFactor Decimal  @default(1.5) @db.Decimal(3, 2)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  users User[]
  flats Flat[]
}
```

> **Added during the Phase 1 review** (2026-08-05), not the initial Task 1.1 pass —
> both fields were explicit requirements (`upiVpa`: Epic 2, "UPI VPA for QR
> generation"; `tenantRateFactor`: rule 1, "have this factor configurable") that got
> missed in the first schema pass and were caught on review before Phase 2 built on
> top of them.

- **`upiVpa` is required, not optional.** Task 6.1 (QR generation) is entirely
  non-functional without a payment address to encode into the UPI deep link — a
  society genuinely can't be onboarded without one, so the schema shouldn't allow it.
- **`tenantRateFactor` defaults to `1.5`** (matching rule 1's example) but is a real
  per-society column, not a hardcoded constant in application code — satisfies "have
  this factor configurable, could be 1.7x or 2x etc." literally. Only applies when a
  `MaintenanceRecord.payerType` is `TENANT`; owner-occupied months always bill at a
  flat 1x `baseRate` (no factor applied).
- **`@db.Decimal(3, 2)`** allows up to `9.99` — comfortably more headroom than any
  realistic multiplier needs, while still being an exact decimal type (see `Flat`
  below for why money/rate fields never use `Float`).

## User — the `Role` enum

```prisma
enum Role {
  ADMIN
  OWNER
  TENANT
}
```

Matches the three personas from the requirements doc exactly (§2). Enforced server-side
on every protected route starting in Phase 2 (Task 2.5's role-guard middleware) — the
enum here is what makes an invalid role a schema-level impossibility, not just an
application-level check.

## User

```prisma
model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  phone        String?  @unique
  passwordHash String
  role         Role
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  societyId String
  society   Society @relation(fields: [societyId], references: [id])

  @@index([societyId])
}
```

Field decisions worth explaining:

- **`email` is required + unique; `phone` is optional + unique.** Epic 1 says login is
  "email/phone + password" — email is treated as the guaranteed identifier every user
  has, phone as an optional second one. Postgres allows multiple `NULL`s in a unique
  column, so users without a phone number don't collide with each other.
- **`passwordHash`, not `password`.** Only Task 2.1 (admin-created user endpoint) will
  ever write to this field, always via bcrypt — the field is named to make it clear a
  plaintext password should never be assigned to it.
- **`societyId` is a plain required field + explicit relation**, not optional — every
  user belongs to exactly one society, no orphaned users. This is also the field every
  later query filters on for tenant isolation (Task 2.6's scoping middleware).
- **`@@index([societyId])`** — added because almost every future query in the system
  will filter by `societyId` (that's the entire point of the tenant-scoping middleware);
  without an index, that filter would force a full table scan as data grows.
- No `Flat` relations here yet (`ownedFlats`, `tenantFlats`) — those get added in Task
  1.2, once the `Flat` model exists to relate to. Prisma requires both sides of a
  relation declared together, so this is 1.2's job, not 1.1's.

> **Addition (2026-08-06)**: `name`, `phone`, and `email` are also what a resident's
> planned self-service profile update (`PATCH /api/me`, see `CLAUDE.md`) will write to
> directly, for their own row — no new field needed. See `docs/auth.md` for how a
> self-service-created `TENANT` (`role`, `passwordHash`) gets provisioned with a
> working login without a password field ever being collected from the owner creating
> them.

## Migration

```
prisma/migrations/20260805124800_add_society_and_user/migration.sql
```

Applied via `npx prisma migrate dev --name add_society_and_user`. Foreign key uses
`ON DELETE RESTRICT` (Prisma's default) — deleting a `Society` that still has `User`
rows will fail rather than cascade-deleting them, which is the safer default for this
MVP since no "delete society" feature is in scope at all (§7, out of scope).

## Flat

```prisma
model Flat {
  id         String   @id @default(cuid())
  wing      String
  flatNumber String
  baseRate   Decimal  @db.Decimal(10, 2)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  societyId String
  society   Society @relation(fields: [societyId], references: [id])

  ownerId String
  owner   User   @relation("FlatOwner", fields: [ownerId], references: [id])

  currentTenantId String?
  currentTenant   User?   @relation("FlatCurrentTenant", fields: [currentTenantId], references: [id])

  occupancyChanges OccupancyChange[]

  @@unique([societyId, wing, flatNumber])
  @@index([societyId])
}
```

- **`baseRate` is `Decimal`, not `Float`.** Money is never stored as a float in this
  codebase — binary floating point can't represent amounts like `1000.10` exactly,
  which is unacceptable for anything billing-related. `Decimal` maps to Postgres's
  `numeric` type and Prisma's `Decimal.js`-backed type in JS, giving exact arithmetic.
  Every future money field (invoice totals, etc.) should follow this same pattern.
- **`ownerId` is required; `currentTenantId` is optional.** Every flat has exactly one
  owner (Epic 2), but not every flat currently has a tenant — an owner-occupied flat
  has `currentTenantId: null`.
- **Two named relations to `User`** (`"FlatOwner"` and `"FlatCurrentTenant"`) — required
  here because `Flat` has *two* separate relations to `User`; without names, Prisma
  can't tell which foreign key (`ownerId` vs `currentTenantId`) pairs with which
  back-relation field on `User` (`ownedFlats` vs `currentTenantFlats`). Confirmed by
  testing: removing both names at once produces a real validation error ("Ambiguous
  relation detected"). `OccupancyChange.tenant` below, by contrast, is the *only*
  relation between `OccupancyChange` and `User` — no ambiguity, so no name is needed
  there, same as `User.society`.
- **`currentTenantId` is a denormalized convenience field, not the source of truth for
  history.** It's what Task 3.3's flat-list view reads for a fast "who's living here
  right now" lookup, but it only ever reflects the *current* state. The actual
  historical record — needed for correct billing when occupancy changed mid-quarter —
  lives entirely in `OccupancyChange`, below.

## OccupancyChange

```prisma
model OccupancyChange {
  id             String    @id @default(cuid())
  effectiveStart DateTime
  effectiveEnd   DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  flatId String
  flat   Flat   @relation(fields: [flatId], references: [id])

  tenantId String
  tenant   User   @relation(fields: [tenantId], references: [id])

  @@index([flatId])
  @@index([tenantId])
}
```

**Key design decision: this table only records *tenant* occupancy periods.**
Owner-occupied periods are never stored as rows — they're implicit, defined as "any
date not covered by an `OccupancyChange` row for that flat." This keeps the model
simple (no `payerType` column needed here, no need to ever create a row when a flat
reverts to owner-occupied) and maps directly onto how Task 3.2's endpoints will work:

- **Assigning a tenant** creates a new `OccupancyChange` row: `tenantId` set,
  `effectiveStart` = today, `effectiveEnd` = `null` (open-ended, "still ongoing").
- **Removing a tenant** closes the *existing* open row by setting its `effectiveEnd` —
  it does not create a new row.

> **Addition (2026-08-06)**: this exact mechanism is also what the planned
> resident-facing (owner self-service) tenant management reuses — see `CLAUDE.md`'s
> "Addition (2026-08-06)" and `docs/flats.md`'s "Not yet built" section. The one
> behavioral difference: the resident-facing version updates the existing tenant's
> `User` row in place when the flat already has one (matching a single-form "Save"
> UX), rather than rejecting re-assignment the way Task 3.2's admin endpoint does.

### Worked example: mid-quarter tenant change

Flat 12B, owner-occupied since the flat was onboarded. On **11 Jan 2026**, the owner
moves out and a tenant moves in:

```
OccupancyChange {
  flatId: "flat_12b",
  tenantId: "tenant_priya",
  effectiveStart: 2026-01-11,
  effectiveEnd: null   ← still ongoing
}
```

Querying "who is the payer on 5 Jan 2026?" (before the row's `effectiveStart`) finds no
covering row → **owner**. Querying "who is the payer on 15 Jan 2026?" finds this row
covering that date → **tenant_priya**. This is exactly what Task 1.2's stub function,
`getPayerForFlatOnDate` (`src/occupancy.ts`), does — and exactly what its test asserts.

**This stub is deliberately not the real billing logic.** It answers "who's occupying
on this one date," which is necessary-but-not-sufficient for correct billing — Task 4.1
needs to answer "what rate applies for this whole calendar month," using the
majority-of-days rule with the last-day tiebreak (see `CLAUDE.md`'s confirmed
decisions), which requires reasoning over a date range, not a single point in time.
Task 1.2's job was proving the schema *can* answer the occupancy question at all;
Task 4.1 builds the real month-level rate calculation on top of it.

## MaintenanceRecord

> **Pivot note (2026-08-05):** the original design (still visible in git history)
> bundled 3 monthly `MaintenanceRecord`s into a quarterly `Invoice`, which was the only
> payable entity. That's been dropped — `MaintenanceRecord` is now independently
> payable, immediately after generation, with a resident able to select any combination
> of their unpaid months to settle in one payment. `Invoice` no longer exists. See
> `CLAUDE.md`'s business rules and `task-prompts-v1` (the current tracker) for the full
> reasoning. This section describes the *current* schema, not the original one.

```prisma
enum PayerType {
  OWNER
  TENANT
}

enum PaymentStatus {
  UNPAID
  PENDING_REVIEW
  PAID
}

model MaintenanceRecord {
  id        String        @id @default(cuid())
  period    String
  payerType PayerType
  amount    Decimal       @db.Decimal(10, 2)
  status    PaymentStatus @default(UNPAID)
  dueDate   DateTime
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  flatId String
  flat   Flat   @relation(fields: [flatId], references: [id])

  payerId String
  payer   User   @relation(fields: [payerId], references: [id])

  @@unique([flatId, period])
  @@index([flatId])
  @@index([status])
  @@index([payerId])
}
```

> **`payerId` added during the Phase 1 review** (2026-08-05) — the original pass only
> stored `payerType` (`OWNER`/`TENANT` as a category), not the specific `User`. Traced
> through a concrete failure case using the seed data: flat B-201 has Frank as tenant
> Jan–Apr, then Grace from May onward. A record for period `"2026-02"` has
> `payerType: TENANT`, but `Flat.currentTenantId` now points at Grace, not Frank — so
> any code resolving "who do I notify/bill for this record" via `currentTenantId`
> would attribute a past charge to the wrong person the instant occupancy changes
> again. `payerId` is resolved once, correctly, at generation time (Task 4.1/4.2) from
> occupancy history, and stored — every later consumer (notifications, payment
> display, audit trail) reads this field, rather than each one re-implementing the
> majority-of-days-with-tiebreak resolution independently.

- **`MaintenanceRecord` is the sole payable entity.** One row per flat per calendar
  month (`period` = `"YYYY-MM"`), generated monthly (Task 4.2), payable immediately —
  no bundling, no waiting for a quarter to close. `status` starts `UNPAID` and
  `dueDate` is set at generation time (generation date + configured days).
- **Every record stays a clean binary paid/unpaid state — never partially paid.**
  "Partial payment" in this system means *selecting a subset of unpaid records* to
  settle in one payment action (Task 6.x), not splitting a single record's amount.
  A resident who owes 3 months can pay just 1 of them; that record goes `UNPAID` →
  `PENDING_REVIEW` → `PAID` on its own, the other 2 stay untouched. This deliberately
  avoids needing a running "amount remaining" field, multiple proofs against one
  record, or a `PARTIALLY_PAID` status — every state transition is a clean, atomic,
  all-or-nothing flip, same principle the original quarterly rule intended, just
  scoped to "however many records were selected" instead of "always exactly 3."
- **`@@unique([flatId, period])`** enforces "exactly 12 records/flat/year, never
  duplicated" at the database level — backs the idempotency Task 4.2 requires of the
  monthly generation job.
- **`@@index([status])`** — added because the admin dues-summary (Task 4.6), the
  escalation job (Task 7.6), and the dashboard widgets (Task 8.1/8.2) all filter
  heavily on `status = UNPAID`.
- **`PayerType` is a separate enum from `Role`**, even though both have `OWNER` and
  `TENANT` values — `Role` also has `ADMIN`, which can never be a billing payer.
  Reusing `Role` here would let invalid states (a record billed to `ADMIN`) exist at
  the type level; a dedicated enum makes that impossible.
- **`PaymentStatus` matches §3 rule 7's flow exactly** (renamed from the original
  `InvoiceStatus`, same three values): `UNPAID` → (proof uploaded) →
  `PENDING_REVIEW` → (admin approves) → `PAID`, or (admin rejects) → back to `UNPAID`.

## PaymentProof, NotificationLog, AuditLog

```prisma
enum ProofStatus {
  PENDING
  APPROVED
  REJECTED
}

model PaymentProof {
  id         String      @id @default(cuid())
  fileUrl    String
  status     ProofStatus @default(PENDING)
  adminNote  String?
  reviewedAt DateTime?
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt

  uploadedById String
  uploadedBy   User   @relation("ProofUploader", fields: [uploadedById], references: [id])

  reviewedById String?
  reviewedBy   User?   @relation("ProofReviewer", fields: [reviewedById], references: [id])

  maintenanceRecords MaintenanceRecord[]

  @@index([uploadedById])
  @@index([status])
}
```

### PaymentProof's many-to-many link to MaintenanceRecord

This is the schema change the pivot actually required. `PaymentProof` doesn't hold a
single foreign key to one payable entity — it has a **many-to-many relation** to
`MaintenanceRecord` (the `maintenanceRecords MaintenanceRecord[]` field above, mirrored
by `paymentProofs PaymentProof[]` on `MaintenanceRecord`). This is an **implicit**
many-to-many — no join model was written by hand; Prisma generates and manages a
hidden join table itself (confirmed in the migration SQL:
`_MaintenanceRecordToPaymentProof`, with `ON DELETE CASCADE` on both sides — deleting
either a record or a proof cleans up the join row without touching the other real
table).

**Worked example: one proof covering 2 selected months.**

A resident owes Jan (₹1000) and Feb (₹1000), both `UNPAID`. They select both, pay
₹2000 via UPI, upload one screenshot:

```
PaymentProof {
  fileUrl: "/uploads/proofs/xyz.jpg",
  status: PENDING,
  uploadedById: "usr_owner",
  maintenanceRecords: [jan_record, feb_record]   ← connected via the join table
}
```

Both `jan_record` and `feb_record` flip to `PENDING_REVIEW`. When admin approves:

```
PaymentProof.status → APPROVED
PaymentProof.reviewedById → "usr_admin"
PaymentProof.reviewedAt → now()
jan_record.status → PAID   ┐  cascaded together,
feb_record.status → PAID   ┘  one transaction (Task 6.5)
```

This is exactly what Task 1.4's test does: creates 2 records, connects both to one
proof, asserts the proof's `maintenanceRecords` has length 2, transitions
`PENDING` → `APPROVED`.

### Why `uploadedBy`/`reviewedBy` need two named relations to `User`

Same rule as `Flat.owner`/`Flat.currentTenant` (see above) — `PaymentProof` has two
separate relations to `User`, so both need names (`"ProofUploader"`,
`"ProofReviewer"`) or Prisma can't tell which foreign key pairs with which back-relation
field on `User`.

### NotificationLog and AuditLog — the polymorphic-lite pattern

```prisma
enum NotificationChannel {
  EMAIL
}

enum NotificationStatus {
  SENT
  FAILED
}

model NotificationLog {
  id                String              @id @default(cuid())
  channel           NotificationChannel
  recipient         String
  status            NotificationStatus
  relatedEntityType String
  relatedEntityId   String
  createdAt         DateTime            @default(now())

  @@index([relatedEntityType, relatedEntityId])
}

model AuditLog {
  id         String   @id @default(cuid())
  action     String
  entityType String
  entityId   String
  note       String?
  createdAt  DateTime @default(now())

  actorId String?
  actor   User?   @relation(fields: [actorId], references: [id])

  @@index([entityType, entityId])
}
```

- **`relatedEntityType`/`relatedEntityId` and `entityType`/`entityId`** are a
  lightweight polymorphic reference, not a real foreign key — Postgres has no native
  "this column can point at rows in different tables" constraint. A notification or
  audit entry can be about a `MaintenanceRecord` (generated, Task 7.2), a
  `PaymentProof` (submitted/approved/rejected, Tasks 7.3/7.4/6.5/6.6), etc. — the
  target table varies per row, so a strict FK isn't possible here. The composite index
  on `(type, id)` keeps "find all log entries about entity X" fast despite no FK.
- **`NotificationChannel` has only `EMAIL` today** — modeled as an enum (not a bare
  string) so adding a channel later (WhatsApp, once out of the compliance-risk
  out-of-scope list) is a one-line enum addition + migration, not a switch from an
  untyped string to a typed one.
- **`AuditLog.actorId` is nullable.** Most audited actions have a human actor (an
  admin approving a proof), but Task 4.2's monthly generation job runs on a cron with
  no human involved — `actorId: null` represents "the system did this," not a bug or
  missing data.

## Gotcha: `prisma migrate dev` didn't actually regenerate the client

Task 1.1 hit this directly: after running `npx prisma migrate dev`, the migration
applied to the database successfully (confirmed via the CLI's own output), but
`src/generated/prisma/` still had the *old*, empty client — `prisma.society` was
`undefined` at runtime, even though the `Society` table now existed in Postgres. The
fix was running `npx prisma generate` explicitly afterward, which produced the correct
typed client.

**Practical takeaway: after any `prisma migrate dev`, explicitly run `npx prisma
generate` and confirm `src/generated/prisma/models.ts` lists the models you just added,
rather than assuming the client is in sync.** `server/Dockerfile` was already doing this
correctly (it has its own explicit `RUN npx prisma generate` step before the build), so
Docker builds weren't affected — this only bit the local/manual workflow.
