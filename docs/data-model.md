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
  id                String   @id @default(cuid())
  name              String
  address           String
  upiVpa            String?
  bankAccountNumber String?
  bankIfsc          String?
  tenantRateFactor  Decimal  @default(1.5) @db.Decimal(3, 2)
  defaultBaseRate   Decimal  @default(1500) @db.Decimal(10, 2)

  receiptNumberPrefix      String  @default("RCPT")
  receiptSignatoryName     String?
  receiptSignatoryTitle    String?
  receiptFooterNote        String?
  receiptSignatureFileKey  String?
  receiptSignatureMimeType String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users    User[]
  flats    Flat[]
  receipts Receipt[]
}
```

> **`upiVpa` became optional, `bankAccountNumber`/`bankIfsc` added (2026-08-12)** —
> a society without a UPI collection address can instead configure a bank account
> number + IFSC pair, shown to a resident during Pay instead of a QR code. UPI
> always takes precedence when both are configured. `bankAccountNumber`/`bankIfsc`
> are validated as a pair (both-or-neither) in `society-settings.service.ts`'s
> `updateSocietySettings`, not at the schema level — Prisma can't express "A or (B
> and C)" as a column constraint. Full contract: `docs/payments.md`'s "Payment
> method: UPI or bank transfer" section.

> **Receipt fields added 2026-08-11** (Receipt Generation & Approval Workflow) —
> admin-configurable letterhead for the PDF receipt issued when a Deposit/Credit is
> approved. `receiptNumberPrefix` needs a working default (`"RCPT"`) so receipts
> issue correctly before an admin ever visits Settings; the rest are optional, simply
> omitted from a rendered receipt when unset. `receiptSignatureFileKey` is an opaque
> `StorageAdapter` key (same contract as `LedgerEntry.fileUrl`), never a public URL.
> Full contract: `docs/receipts.md`.

> **`defaultBaseRate` added 2026-08-06** (admin Settings tab addendum, `CLAUDE.md`):
> pre-fills the base-rate field when onboarding a *new* flat via the admin UI. Purely a
> UI default — `Flat.baseRate` stays the actual per-flat value used in every
> calculation, independently editable, unaffected by later changes to this field.
> `GET`/`PATCH /api/admin/settings` (admin-only) expose this and `tenantRateFactor`
> together as "the two values that drive billing," even though only `tenantRateFactor`
> is read directly by `calculateMonthlyRate` — see `docs/maintenance-records.md`.

> **Added during the Phase 1 review** (2026-08-05), not the initial Task 1.1 pass —
> both fields were explicit requirements (`upiVpa`: Epic 2, "UPI VPA for QR
> generation"; `tenantRateFactor`: rule 1, "have this factor configurable") that got
> missed in the first schema pass and were caught on review before Phase 2 built on
> top of them.

- **`upiVpa` was originally required, not optional** — Task 6.1 (QR generation) is
  entirely non-functional without a payment address to encode into the UPI deep
  link. Relaxed to optional (2026-08-12) once `bankAccountNumber`/`bankIfsc` gave a
  society a second way to configure payment collection; `ledger.service.ts`'s
  `buildPaymentIntentResult` throws `PaymentMethodNotConfiguredError` if a society
  ends up with neither configured, so a payment intent still can't be created
  without *some* way to collect money — just not necessarily UPI specifically.
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

> **Pivot note (2026-08-06): `status` removed.** A second pivot (see `CLAUDE.md`'s
> "Pivot (2026-08-06): resident view moves to a transaction ledger") replaced the
> record-selection payment model above with a balance-based ledger. Under that model, a
> `MaintenanceRecord` is always a SYSTEM charge — implicitly "Approved," never
> individually paid/unpaid **in the schema** — so the `status`/`PaymentStatus` columns
> below (and the `@@index([status])`) no longer exist. `dueDate` is kept, since
> escalation (`lib/escalation.ts`) still needs it. Payment against the running balance
> now lives entirely in the new `LedgerEntry` model, below.
>
> **Addendum (2026-08-07): a per-record status is back, but derived, not stored.**
> Residents and admins need to see *which specific months* are paid/partial/unpaid, not
> just the flat's one aggregate Outstanding. Rather than re-adding a stored `status`
> column (which would resurrect exactly the state this pivot removed, plus need a
> backfill for existing approved deposits), `ledger.service.ts`'s
> `computeRecordSettlements` computes it fresh on every read — FIFO-filling a flat's
> `approvedDeposits` total across its records oldest-first. No schema change at all;
> this model is unchanged from the pivot above. Full mechanism:
> `docs/payments.md`'s "Settlement status" section, `CLAUDE.md`'s 2026-08-07 addendum.

```prisma
enum PayerType {
  OWNER
  TENANT
}

model MaintenanceRecord {
  id        String   @id @default(cuid())
  period    String
  payerType PayerType
  amount    Decimal  @db.Decimal(10, 2)
  dueDate   DateTime
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  flatId String
  flat   Flat   @relation(fields: [flatId], references: [id])

  payerId String
  payer   User   @relation(fields: [payerId], references: [id])

  @@unique([flatId, period])
  @@index([flatId])
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

- **`MaintenanceRecord` is always a SYSTEM charge under the ledger model.** One row per
  flat per calendar month (`period` = `"YYYY-MM"`), generated monthly (Task 4.2),
  contributing its `amount` to the flat's `totalCharges` permanently — it is never
  individually marked paid *in this schema*. `dueDate` is set at generation time
  (generation date + configured days) and still drives escalation (now off the oldest
  *unsettled* record — see the 2026-08-07 addendum above). A derived, un-stored
  settlement status (Unpaid/Partially Settled/Paid) is computed on read for display.
- **Payment is now balance-based, not per-record.** A resident's Outstanding is a
  single running number (`totalCharges` minus approved Deposits, floored at 0 — see
  `LedgerEntry` below) — they may pay any amount up to Outstanding, including less
  than the full amount (explicit partial payment against the aggregate). This
  replaces the earlier per-record `UNPAID`/`PENDING_REVIEW`/`PAID` selection flow.
- **`@@unique([flatId, period])`** enforces "exactly 12 records/flat/year, never
  duplicated" at the database level — backs the idempotency Task 4.2 requires of the
  monthly generation job.
- **`PayerType` is a separate enum from `Role`**, even though both have `OWNER` and
  `TENANT` values — `Role` also has `ADMIN`, which can never be a billing payer.
  Reusing `Role` here would let invalid states (a record billed to `ADMIN`) exist at
  the type level; a dedicated enum makes that impossible.

## LedgerEntry, NotificationLog, AuditLog

> **Pivot note (2026-08-06):** `PaymentProof` (and its implicit many-to-many join to
> `MaintenanceRecord`) is **replaced** by `LedgerEntry`, described below — see
> `CLAUDE.md`'s "Pivot (2026-08-06): resident view moves to a transaction ledger" for
> the full reasoning. The app was still pre-launch/seed-data-only at the time, so the
> old table was dropped outright rather than data-migrated.
>
> **Pivot note (2026-08-07): Credit removed entirely.** `LedgerEntry` originally had
> a `type` column (`DEPOSIT`/`CREDIT`) — Credit (an advance deposit or expense
> reimbursement the resident logs, separately from a UPI payment) has been dropped
> from the product entirely (confirmed decision: the society will never use it). The
> `type` column and `LedgerType` enum are gone — `LedgerEntry` only ever represents a
> Deposit now. This also collapsed the balance formula from three numbers
> (Outstanding/Credit balance/Payable) down to one (Outstanding), since Payable was
> only ever Outstanding minus Credit.
>
> **Addendum (2026-08-07, same day): Credit re-introduced, `type` is back.** Confirmed
> against a plain-text credit-allocation spec. `type LedgerType` returns via a new
> migration (`20260807170000_readd_credit`) — same enum, same column, backfilled to
> `DEPOSIT` for every pre-existing row. But the *meaning* is different from before:
> Credit is no longer a separately-netted balance (the removed `Payable = Outstanding
> - Credit` split isn't coming back) — it's pooled with Deposit money and
> FIFO-allocated across records by the same `computeRecordSettlements` the
> per-record-settlement addendum (below) already built for payments. See `CLAUDE.md`'s
> "Credit re-introduced" addendum for the full reasoning and the worked formula.

```prisma
enum ProofStatus {
  PENDING
  APPROVED
  REJECTED
}

enum LedgerType {
  DEPOSIT
  CREDIT
}

model LedgerEntry {
  id       String      @id @default(cuid())
  type     LedgerType
  amount   Decimal     @db.Decimal(10, 2)
  status   ProofStatus @default(PENDING)
  note     String?
  fileUrl  String?
  mimeType String?
  adminNote  String?
  reviewedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  flatId String
  flat   Flat @relation(fields: [flatId], references: [id])

  payerId String
  payer   User @relation("LedgerPayer", fields: [payerId], references: [id])

  reviewedById String?
  reviewedBy   User?   @relation("LedgerReviewer", fields: [reviewedById], references: [id])

  @@index([flatId])
  @@index([status])
}
```

**One row, one flat, one payer — no join table.** Unlike `PaymentProof`, a
`LedgerEntry` is never linked to specific `MaintenanceRecord`s, because settlement is
computed against the flat's aggregate funds, not particular months (a partial deposit
might not exactly cover any one charge — see `computeRecordSettlements`, below). A
`LedgerEntry` row represents either a **Deposit** (a UPI payment, `fileUrl` optional)
or a **Credit** (a committee-approved adjustment, `note` **and** `fileUrl` both
required at the application level — the inverse of a Deposit, where proof is
optional) — SYSTEM charges are *not* stored here at all; they remain
`MaintenanceRecord` rows (above), always implicitly "Approved."

**Only `APPROVED` rows count toward the running balance** (computed in
`ledger.service.ts`'s `balancesFromRows`, reused by both the resident's own Dashboard
and the admin dashboard so the formula lives in exactly one place). Updated 2026-08-07
to fold Credit back in — `outstanding` and `availableCredit` are the two sides of the
same subtraction, exactly one of them is ever nonzero:

```
totalCharges     = sum(MaintenanceRecord.amount) for the flat, every row
approvedDeposits = sum(LedgerEntry.amount) where type=DEPOSIT, status=APPROVED
approvedCredits  = sum(LedgerEntry.amount) where type=CREDIT,  status=APPROVED
approvedFunds    = approvedDeposits + approvedCredits

outstanding      = max(0, totalCharges - approvedFunds)
availableCredit  = max(0, approvedFunds - totalCharges)
```

`PENDING`/`REJECTED` rows stay visible in the resident's dashboard for transparency
but are excluded from every sum — including a still-pending Credit request, which must
have zero effect on any balance until an admin approves it.

**Per-record settlement (Unpaid/Partially Settled/Paid), derived — not stored.**
`ledger.service.ts`'s `computeRecordSettlements(records, totalApprovedFunds)` FIFO-fills
`approvedFunds` (the same lump sum as above) across a flat's `MaintenanceRecord`s
oldest-first, computed fresh on every read rather than adding a stored per-record
column. See `CLAUDE.md`'s per-record-settlement and "Credit re-introduced" addenda for
the full reasoning — in short, the fill is order-independent (a Deposit and a Credit
contributing to the same record just add together, and it doesn't matter which arrived
first or was approved first), so no history ever needs to be replayed.

**`fileUrl`/`mimeType` are optional at the schema level** — unlike the pre-pivot
`PaymentProof.fileUrl` (required), a proof screenshot is no longer mandatory to
submit a Deposit (a real reversal of the old rule 7, see `CLAUDE.md`). **A Credit is
the exception**: `createCredit` requires `file` at the application level (not the
schema — nothing stops a future caller from omitting it at the DB layer, but
`POST /api/me/ledger/credits` always rejects with `400` first), same server-side
validation as a Deposit's optional screenshot. Same opaque-storage-key contract as
before otherwise (`StorageAdapter`, `docs/payments.md`) — served only through the
authenticated `GET /api/ledger-entries/:id/file`.

**`note` vs `adminNote`** — for a Deposit, `note` is a short fixed string set by the
server (e.g. "UPI payment - awaiting review"), not resident-authored input. For a
Credit, `note` **is** resident-authored and required — the reason a committee needs to
evaluate an arbitrary discretionary adjustment (`createCredit`'s `note` param). Either
way, `adminNote` is the admin's rejection reason (rule 7), set only on reject —
distinct fields because they're written by different parties at different times.

### Why `payer`/`reviewedBy` need two named relations to `User`

Same rule as `Flat.owner`/`Flat.currentTenant` (see above) — `LedgerEntry` has two
separate relations to `User`, so both need names (`"LedgerPayer"`, `"LedgerReviewer"`)
or Prisma can't tell which foreign key pairs with which back-relation field on `User`.

## Receipt (2026-08-11)

```prisma
model Receipt {
  id            String   @id @default(cuid())
  receiptNumber String   @unique
  fileKey       String
  issuedAt      DateTime @default(now())

  ledgerEntryId String      @unique
  ledgerEntry   LedgerEntry @relation(fields: [ledgerEntryId], references: [id])

  issuedById String
  issuedBy   User   @relation("ReceiptIssuer", fields: [issuedById], references: [id])

  societyId String
  society   Society @relation(fields: [societyId], references: [id])

  @@index([societyId])
  @@index([issuedById])
}
```

Created only at the moment a `LedgerEntry` is actually approved (or, for the cash/
bank-transfer fallback, created already-approved) — never speculatively, never for
a rejected entry. **1:1 with `LedgerEntry`**, not a history of every receipt ever
generated for it — there's exactly one issuance event per approved entry, so a
unique `ledgerEntryId` is sufficient; there's nothing to version.

**`fileKey` points at an already-rendered PDF, not a template to re-render on
each read.** Same opaque `StorageAdapter` key contract as `LedgerEntry.fileUrl`.
This is the concrete mechanism behind "Settings changes only affect future
receipts, never retroactively alter an already-issued one" — there is no
template being re-evaluated at read time to *have* drifted; the bytes are a
frozen fact from the moment `storage.save()` ran.

**`receiptNumber` is derived, not a separate sequence.** Computed as
`{Society.receiptNumberPrefix}-{flat.wing}{flat.flatNumber}-{ledgerEntryId}`
(`receipt.service.ts`'s `buildReceiptNumber`) — since a `LedgerEntry`'s `id`
already exists before it's approved, the number is fully known in advance, so a
pre-approval preview and the number actually persisted here can never disagree.
No counter table, no race condition to guard against.

Full contract, endpoints, and the two implementation judgment calls (whether the
manual cash/bank-transfer fallback also issues a receipt, and what happens for a
legacy entry approved before this model existed): `docs/receipts.md`.

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
