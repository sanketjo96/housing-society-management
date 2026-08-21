# Society Onboarding — Architecture

## Design Principle
Reuse existing single-row mechanisms and their validation wherever one
exists (`createFlat`, `billOtherCharge`, `recordSocietyLedgerEntry`,
`findOrCreateUserByEmail`) — every bulk-import path in this feature is a
thin CSV-parsing wrapper around an existing service call, never a parallel
reimplementation of its rules. The one genuinely new mechanism is Phase A's
society-bootstrap endpoint, which has no existing single-row precedent to
wrap (nothing in this codebase has ever created a `Society` outside
`seed.ts`).

## Data Model

No changes to any existing model's shape. Two small additions:

```prisma
model Society {
  // ...existing fields unchanged...

  // Plain-text catch-all for concepts this app doesn't model yet (e.g. a
  // legacy society's Sinking Fund balance) — never billed, never summed,
  // never read by any calculation. Purely so the figure isn't lost during
  // onboarding while a real model (if ever needed) stays unbuilt until a
  // concrete trigger appears — see 05-future-scope.md item 1.
  internalNote String?
}
```

`MaintenanceRecord` itself is **unchanged** — Phase C's "Opening Balance"
concept is represented using the existing schema, not a new column or flag:

```
MaintenanceRecord {
  period: "0000-01"   // sentinel — sorts before every real "YYYY-MM" period
  payerType: OWNER
  payerId: <flat's current ownerId, resolved server-side>
  amount: <flat's total pre-go-live arrears>
  dueDate: <go-live date>
}
```

This works because `computeRecordSettlements` (`ledger-shared.ts`) sorts
records by `period.localeCompare()` ascending and FIFO-fills from the
front — `"0000-01"` is lexicographically earlier than any real
`"YYYY-MM"` period, so it always settles first, satisfying the requirement
that a resident's first real post-go-live charge never gets settled ahead
of pre-existing arrears. The existing `@@unique([flatId, period])`
constraint makes re-running the import for the same flat safely rejected
as a duplicate, the same idempotency guarantee `generateMaintenanceRecords`
already relies on for its own monthly run.

**Two required display-layer follow-ups** (not optional polish — the
sentinel period will otherwise render as "Jan 0"):
- `client/src/pages/MaintenanceBookPage.tsx`'s `periodLabel()` needs a
  `"0000-01" → "Opening Balance"` guard before its `new Date(...)` call.
- `client/src/components/LedgerEntryDisplay.tsx`'s equivalent period
  formatting needs the same guard.

**Why not a new `OtherCharge` instead**: `OtherCharge` is a fully separate
settlement pool from `MaintenanceRecord` — using it for arrears would mean
a resident's Maintenance Outstanding understates their true legacy debt,
and paying down Maintenance wouldn't touch the arrears at all. The FIFO
ordering guarantee this feature needs only works *within* one pool, so the
sentinel-period `MaintenanceRecord` is the only design that satisfies
Confirmed Product Decision #2 with zero changes to `ledger-shared.ts`.

**Why not a new `SinkingFund` model**: considered and explicitly deferred —
see `05-future-scope.md` item 1 for the full reasoning and trigger
condition.

## Backend Modules

```
server/src/middleware/require-platform-secret.ts   — new
  requirePlatformSecret: checks X-Platform-Bootstrap-Secret against
  process.env.PLATFORM_BOOTSTRAP_SECRET. Runs instead of requireRole (no
  JWT exists yet at this point in the flow) — same "secret only the
  deployer holds" trust model as JWT_ACCESS_SECRET itself.

server/src/features/platform-bootstrap/          — new
  platform-bootstrap.service.ts    bootstrapSociety(input) — one
                                    prisma.$transaction creating the
                                    Society row and its first ADMIN User
                                    together; societyId is generated
                                    inside the transaction, never
                                    client-supplied
  platform-bootstrap.controller.ts
  platform-bootstrap.route.ts      POST /api/platform/societies,
                                    gated by requirePlatformSecret
  platform-bootstrap.schemas.ts    societyName, societyAddress,
                                    adminName, adminEmail (no password —
                                    reuses findOrCreateUserByEmail's own
                                    precedent of triggering
                                    requestPasswordReset immediately)

server/src/features/bulk-charges/                — new
  bulk-charges.service.ts          bulkImportCharges(societyId, csvText)
                                    — branches per row on `pool`:
                                    MAINTENANCE_OPENING_BALANCE creates
                                    the sentinel MaintenanceRecord above;
                                    OTHER_CHARGE resolves an existing
                                    FeeType and reuses billOtherCharge's
                                    exact validation/creation contract
  bulk-charges.controller.ts
  bulk-charges.route.ts            POST /api/admin/bulk-charges/import
  bulk-charges.schemas.ts

server/src/features/society-ledger/
  society-ledger-bulk-import-service.ts   — new, alongside the existing
                                    society-ledger.service.ts
                                    bulkImportSocietyLedgerEntries(...) —
                                    reuses (via a small extracted shared
                                    validator) the same direction-matches-
                                    category and bank-reference-required-
                                    unless-cash checks
                                    recordSocietyLedgerEntry already
                                    enforces; skips the mandatory-file
                                    check by design (Confirmed Decision
                                    #4), auto-appending a "no proof scan
                                    available" note per row instead
  society-ledger.route.ts          extended with
                                    POST /api/admin/society-ledger/import
```

All three new feature folders follow the exact service/controller/route/
schemas split already established by every existing feature (most
recently `finance-categories`/`society-ledger` themselves) —
`requireRole(['ADMIN'])` on every bulk-import handler except Phase A's
bootstrap route, which deliberately uses `requirePlatformSecret` instead
since no admin/JWT exists yet at that point.

## Key Flows

### Phase A — `bootstrapSociety`

```
Platform operator calls
POST /api/platform/societies
  headers: X-Platform-Bootstrap-Secret
  body: { societyName, societyAddress, adminName, adminEmail }
        │
        ▼
requirePlatformSecret — constant-time compare against
  process.env.PLATFORM_BOOTSTRAP_SECRET; 403 if missing/wrong
        │
        ▼
bootstrapSocietySchema.safeParse(req.body)
        │
        ▼
bootstrapSociety(input):
  prisma.$transaction:
    - society = societyCreate({ name, address })   // fresh cuid, never
                                                     // client-supplied
    - admin = userCreate({ ...adminFields, role: 'ADMIN',
                            societyId: society.id,  // from the row just
                                                     // created above, not
                                                     // request input
                            passwordHash: <random, unusable> })
        │
        ▼
requestPasswordReset(admin.email)   — same mechanism
                                       findOrCreateUserByEmail already uses
        │
        ▼
201 response: { societyId, adminUserId }   — no password, no token
```

This is categorically different from the vulnerability class fixed in
`docs/security-audit.md` finding 9.1 (a client-supplied `societyId`
letting an *existing* ADMIN reach into another society): this endpoint
never accepts a `societyId` referring to anything that already exists, is
mounted outside `/api/admin/*`, and is gated by a secret no ADMIN JWT
(stolen or otherwise) could ever produce.

### Phase C — `bulkImportCharges`

```
Admin uploads CSV via the new bulk-charges import page
  columns: wing, flatnumber, pool, feetypename (if OTHER_CHARGE), amount, note
        │
        ▼
for each row (errors collected, batch continues):
  flat = findFirst({ wing, flatNumber, societyId })
    → row error if not found
  if pool === MAINTENANCE_OPENING_BALANCE:
    maintenanceRecord.create({ flatId, period: "0000-01", payerType: OWNER,
      payerId: flat.ownerId, amount, dueDate: <import date>, note })
    → @@unique([flatId, period]) makes a re-run a safe no-op/row-error,
      not a duplicate
  if pool === OTHER_CHARGE:
    feeType = findFirst({ name: feetypename, societyId, isActive: true })
      → row error if missing/inactive
    otherCharge.create({ flatId, feeTypeId, payerId: flat.ownerId, amount,
      dueDate: <import date>, note })   // same shape billOtherCharge
                                          // already produces
        │
        ▼
201 response: { imported: N, errors: [{ row, message }, ...] }
```

### Phase E — `bulkImportSocietyLedgerEntries`

```
Admin uploads CSV via a new panel on ManageFinancePage.tsx
  columns: direction, categoryname, amount, transactiondate, paymentmethod,
           bankreference (required unless CASH), note
        │
        ▼
for each row (errors collected, batch continues):
  category = findFirst({ name: categoryname, societyId, isActive: true })
    → row error if missing/inactive
  category.direction !== direction → row error (shared validator, same
    check recordSocietyLedgerEntry already runs)
  paymentmethod !== CASH && !bankreference → row error (shared validator)
  societyLedgerEntry.create({ ...row, fileUrl: null, mimeType: null,
    note: `${note ?? ''} [Imported from legacy records — no proof scan
    available]`.trim(), recordedById: <importing admin> })
        │
        ▼
201 response: { imported: N, errors: [...] }
```

## Frontend Architecture

**Implementation status (2026-08-21): built, with one placement change from the
original sketch below.** All three CSV importers (Resident roster, Charges, Finance
history) live under a single **"Imports" sidebar submenu** (`DashboardLayout.tsx`),
each as its own child route/page — `/imports/residents` (`ImportsPage.tsx`),
`/imports/charges` (`BulkChargesImportPage.tsx`), `/imports/finance`
(`FinanceHistoryImportPage.tsx`). This nav grouping didn't exist when this doc was
first written; it was added the same day this feature was actually implemented, and
every import surface was placed under it — including Phase E, which the original
sketch below put inline on `ManageFinancePage.tsx` instead. That placement changed
deliberately: **"every onboarding import lives in one place"** was a real, explicit
requirement by the time this got built, not an oversight — see the "Key
Architectural Decisions" list below, item 6. The Resident roster import
(`bulkImportFlats`, already-shipped before this feature) was *moved* into this same
submenu from where it previously lived inline on `FlatsListPage.tsx`, rather than
duplicated. The three panels share one component, `client/src/components/
CsvImportPanel.tsx` (extracted once the third near-identical copy was about to be
written) — template download, file upload, and a per-row error list, parameterized
per page by endpoint/template/labels and a `renderSuccessMessage` callback (the
three backends' response shapes aren't identical: Flats returns `created`, the
other two return `imported`).

| Surface | Pattern reused |
|---|---|
| Shared `CsvImportPanel` (`client/src/components/CsvImportPanel.tsx`) | Template download, file upload, per-row error list — one component, parameterized per caller, not copy-pasted three times |
| `/imports/residents` (`ImportsPage.tsx`) | The Resident roster import (`bulkImportFlats`), moved out of `FlatsListPage.tsx` into this submenu rather than living inline on the page whose table it populates |
| `/imports/charges` (`BulkChargesImportPage.tsx`) | Uses the shared panel above — Opening Balance/Other Charges CSV import |
| `/imports/finance` (`FinanceHistoryImportPage.tsx`) | Uses the shared panel above — historical Manage Finance CSV import; a dedicated page under Imports, **not** an inline panel on `ManageFinancePage.tsx` (see status note above) |
| Phase A's bootstrap call | No UI in v1 — an operator-run API call (curl/Postman/a short internal script), matching this feature's "concierge onboarding" scope (see `04-roadmap.md`); a real admin UI is explicit future scope (`05-future-scope.md`) |
| `MaintenanceBookPage.tsx` / `LedgerEntryDisplay.tsx` | One added conditional in each existing `periodLabel`-style formatter, no new component |

## Key Architectural Decisions
1. **Every bulk-import path is a thin wrapper around an existing single-row
   service's validation, never a parallel reimplementation.** Keeps the
   single source of truth for "what makes a valid charge/entry" exactly
   where it already lives (`billOtherCharge`, `recordSocietyLedgerEntry`),
   so the bulk and single paths can't silently drift apart.
2. **The Opening Balance is a `MaintenanceRecord` with a sentinel period,
   not a new model or column.** Zero changes to the settlement math that
   every other part of this app already depends on being correct.
3. **Phase A's bootstrap is a shared-secret endpoint, not a new Role enum
   value.** A full `PLATFORM_OPERATOR` role would mean new JWT claims, new
   `requireRole` call sites, and a login flow for an account type that
   touches exactly one endpoint — disproportionate to this MVP's actual
   onboarding frequency (see `04-roadmap.md` for the full reasoning).
4. **Bulk-imported Manage Finance rows are visibly marked, not silently
   indistinguishable from normal entries.** The auto-appended note is a
   deliberate, minimal way to flag "this row skipped the usual evidence
   requirement" without adding a new schema column just for that.
5. **Placeholder contact info is a naming convention, not a new schema
   flag.** Adding an `isPlaceholderEmail` boolean to `User` would be more
   "correct" for building an admin-facing "N owners still need real
   contact info" widget later, but that's speculative scope beyond what's
   asked now — logged as future scope, not built.
6. **Every onboarding import lives under one "Imports" sidebar submenu,
   not scattered across the pages each import type happens to feed
   (2026-08-21).** The original sketch above put Phase E's importer inline
   on `ManageFinancePage.tsx`, alongside its existing single-entry form —
   reasonable in isolation, but it meant an admin doing a full onboarding
   run would visit three unrelated corners of the app (Flats, a new
   standalone page, Manage Finance) for what is really one coherent task.
   Grouping all three under one nav destination, each a full page rather
   than a panel bolted onto an unrelated page, makes "everything needed to
   onboard a client from a CSV" discoverable in one place. The Resident
   roster import (already-shipped, previously inline on `FlatsListPage.tsx`)
   was relocated into this same submenu for the same reason, not left
   behind as an inconsistent fourth location.
