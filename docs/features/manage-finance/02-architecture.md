# Manage Finance — Architecture

## Design Principle
`SocietyLedgerEntry` is **society-centric**, deliberately separate from the
existing **resident-centric** `LedgerEntry`. Every `LedgerEntry` row carries a
`flatId`/`payerId` and settles a specific flat's own Outstanding balance via
`balancesFromRows`/`computeRecordSettlements` (`ledger-shared.ts`).
`SocietyLedgerEntry` has no flat, no payer, no settlement math, no FIFO fill —
it's a complete, already-true transaction record the moment it's created, the
same shape as `OtherCharge`/`manualDeposit` ("an admin recording something that
already happened"), never the Deposit/Credit's PENDING-then-reviewed shape. The
two models are never merged or unioned; nothing in this feature reads or writes
`LedgerEntry`, `MaintenanceRecord`, or `OtherCharge`.

## Data Model

```prisma
enum SocietyLedgerDirection {
  INCOME
  EXPENSE
}

// Cash and cheque are legitimate here in a way they never are for a resident
// Deposit (always UPI in practice) — society-level expenses are genuinely paid
// multiple ways, including with no bank trail at all.
enum SocietyLedgerPaymentMethod {
  CASH
  BANK_TRANSFER
  UPI
  CHEQUE
  OTHER
}

model SocietyLedgerCategory {
  id          String                 @id @default(cuid())
  name        String
  description String?
  direction   SocietyLedgerDirection
  isActive    Boolean                @default(true)
  createdAt   DateTime               @default(now())
  updatedAt   DateTime               @updatedAt

  societyId String
  society   Society              @relation(fields: [societyId], references: [id])
  entries   SocietyLedgerEntry[]

  @@unique([societyId, name])
  @@index([societyId])
}

model SocietyLedgerEntry {
  id              String                     @id @default(cuid())
  direction       SocietyLedgerDirection
  amount          Decimal                    @db.Decimal(10, 2)
  transactionDate DateTime
  paymentMethod   SocietyLedgerPaymentMethod
  bankReference   String?
  fileUrl         String?
  mimeType        String?
  note            String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  societyId    String
  society      Society               @relation(fields: [societyId], references: [id])
  categoryId   String
  category     SocietyLedgerCategory @relation(fields: [categoryId], references: [id])
  recordedById String
  recordedBy   User                  @relation("SocietyLedgerRecordedBy", fields: [recordedById], references: [id])

  @@index([societyId])
  @@index([categoryId])
  @@index([transactionDate])
}
```

**Why `SocietyLedgerCategory`, not `FeeType`**: `FeeType` is resident-billing-
specific ("Transfer Fee", "Joining Fee") and has no direction concept —
semantically wrong for a society-level head like "Electricity" or "Bank
Interest". `direction` lives on the category, not re-specified independently
per entry: a head like "Electricity" is inherently an expense head, "Bank
Interest" inherently income. An entry's own `direction` must still match its
chosen category's `direction` — enforced in `society-ledger.service.ts` (Prisma
can't express a cross-row check constraint), not repeated in the entry.

**Why `direction` is denormalized onto the entry too**, not solely derived from
the category via a join: every list/dashboard query becomes a single-table read
this way — no join needed to know if a row is income or expense. The tradeoff
(direction could theoretically drift from the category if the category's
direction changed after the fact — it never does, categories have no edit path
beyond `isActive`) is accepted for read simplicity, same precedent as
`LedgerEntry.category` already being denormalized rather than inferred from
`OtherCharge`/`MaintenanceRecord`.

**Why `isActive`-only, create-and-deactivate, no rename**: same convention as
`FeeType` — a recorded `SocietyLedgerEntry` must keep a valid, named
`categoryId` reference forever. Category rename is explicit future scope, not
built now (see `05-future-scope.md`).

**Why `bankReference`/`fileUrl`/`mimeType` are nullable at the schema level**
even though the application layer requires a file and conditionally requires a
reference: consistency with how `LedgerEntry.fileUrl` is modeled — the DB layer
stays permissive, the service layer enforces the real rule (`recordSocietyLedgerEntry`
rejects a request with no file or a missing-when-required reference).

**Migration**: `add_society_ledger_entry_and_finance_category` — purely
additive, no existing table changes, no backfill needed.

## Backend Modules

```
server/src/features/finance-categories/   — the category catalog
  finance-categories.service.ts     listFinanceCategories, createFinanceCategory,
                                     updateFinanceCategory (isActive-only)
  finance-categories.controller.ts
  finance-categories.route.ts       GET/POST /api/admin/finance-categories,
                                     PATCH /api/admin/finance-categories/:id
  finance-categories.schemas.ts
  finance-categories.openapi.ts

server/src/features/society-ledger/       — the transaction ledger
  society-ledger.service.ts         listSocietyLedgerEntries,
                                     recordSocietyLedgerEntry,
                                     getSocietyLedgerTotals,
                                     getSocietyLedgerEntryFileForViewing
  society-ledger.controller.ts
  society-ledger.route.ts           GET/POST /api/admin/society-ledger,
                                     GET /api/admin/society-ledger/:id/file
  society-ledger.schemas.ts
  society-ledger.openapi.ts
```

Both mirror `other-charges`'s shape exactly (service/controller/route/schemas/
openapi, `requireRole(['ADMIN'])` on every handler, mounted in `app.ts` via a
top-level import + `app.use(...)`, same flat-list pattern every other feature
router already follows).

## `recordSocietyLedgerEntry` — the one write path

```
Admin submits the "Record a transaction" form
        │
        ▼
POST /api/admin/society-ledger  (multipart: direction, categoryId, amount,
  transactionDate, paymentMethod, bankReference?, note?, file)
  - proofUpload.single('file')        (existing middleware, 5MB, image+PDF)
  - verifyFileSignature([...])        (content-sniffed re-check)
  - requireRole(['ADMIN'])
        │
        ▼
recordSocietyLedgerEntrySchema.safeParse(req.body)
  - amount > 0, transactionDate present
  - .refine(): bankReference required unless paymentMethod === CASH
        │
        ▼
if (!req.file) → 400 "A proof attachment is required"
        │
        ▼
recordSocietyLedgerEntry(societyId, adminId, input):
  - category = findFirst({ id: categoryId, societyId, isActive: true })
      → FinanceCategoryNotUsableError (400) if missing/inactive/wrong society
  - category.direction !== input.direction
      → CategoryDirectionMismatchError (400)
  - paymentMethod !== CASH && !bankReference
      → MissingBankReferenceError (400)  (defense in depth — Zod already caught this)
  - !(amount > 0) → InvalidAmountError (400)
        │
        ▼
getStorageAdapter().save({ buffer, societyId, extension })
        │
        ▼
prisma.$transaction:
  - societyLedgerEntry.create({ ...input, fileUrl: key, mimeType, recordedById })
  - auditLog.create({ action: 'RECORD_SOCIETY_LEDGER_ENTRY', ... })
        │
        ▼
201 response with the created entry (incl. category/recordedBy)
        │
        ▼
Client onSuccess: invalidate ['admin-society-ledger'] and
  ['admin-dashboard-summary'] (Society Finance cards refresh immediately)
```

No `notify()` call anywhere in this flow — there is no resident recipient for an
internal society transaction, unlike `billOtherCharge`'s post-transaction
notification.

## Dashboard Integration

`getSocietyLedgerTotals(societyId)` — a plain `findMany` + reduce over
`SocietyLedgerEntry`, matching this codebase's existing aggregation style
(`getBalancesByFlat`, `listOtherCharges`) rather than `prisma.groupBy`, at this
app's 24-flat scale. `admin-dashboard.service.ts`'s `DashboardSummary` interface
gains `societyTotalIncome`/`societyTotalExpense`/`societyNetPosition`, computed
via one added call inside `getDashboardSummary`'s existing `Promise.all`.
**Confirmed: zero changes to `ledger-shared.ts`** — `balancesFromRows`/
`computeRecordSettlements`/`computeFlatBalances` operate only on `flatId`-scoped
rows and never touch `SocietyLedgerEntry`.

## Frontend Architecture

| Surface | Pattern reused |
|---|---|
| `settings/FinanceCategoriesPage.tsx` | Direct copy of `FeeTypesPage.tsx`'s list↔form swap, `DataTable`, create-only form, `ToggleActiveButton`; adds a Direction field/column |
| `ManageFinancePage.tsx` | Same list↔form swap as `OtherChargesPage.tsx`; form submitted as `FormData` (file involved) — same precedent as `CreditBookPage.tsx`'s `AddCreditModal` |
| `AdminDashboardPage.tsx` | New `CardGroup icon={Wallet2} title="Society Finance"` (distinct from the existing "Finance" group, which is resident-billing) with three `SummaryCard`s |
| `DashboardLayout.tsx` | "Manage Finance" as a full sidebar item (primary write action, not a dashboard-tile drill-down); "Finance categories" nested under Settings, alongside "Fee types" |

## Key Architectural Decisions
1. **`SocietyLedgerEntry` is a fresh, deliberately separate model — `LedgerEntry`
   is never renamed or touched.** The two answer different questions ("what does
   this flat owe/has paid" vs. "what did the society itself move") and share no
   rows, no math, no endpoints.
2. **No settlement/FIFO concept at all.** Unlike every other charge/payment pair
   in this app, a `SocietyLedgerEntry` doesn't pay down anything — it IS the
   transaction, complete and immutable the moment it's created.
3. **Single-admin entry, immutable once created.** A deliberate simplification
   over a two-person approval workflow — matches `OtherCharge`'s existing
   precedent; the resulting audit gap (no second sign-off) is accepted as the
   same category of gap `OtherCharge` already has, not a new one.
4. **A mandatory proof attachment on every entry**, unlike a Deposit's optional
   screenshot — every entry here is an admin unilaterally recording money in or
   out, and needs independent evidence every time, same reasoning as
   `createCredit`'s mandatory proof.
5. **`bankReference` required unless Cash — closes a real audit gap.** The
   financial-audit-readiness review that prompted this feature specifically
   flagged the lack of a bank-statement-reconciliation field; this is built in
   from day one here rather than retrofitted.
