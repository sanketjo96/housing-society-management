# Other Charges — Architecture

## Design Principle
Other Charges is a **second, parallel pool** running alongside the existing
maintenance pool — never a second implementation of the balance/settlement math, and
never merged into the first pool's numbers. A single `category` field
(`MAINTENANCE | OTHER_CHARGE`) added to the two models that already carry
resident-initiated money movement (`LedgerEntry`, `PaymentIntent`) is the only thing
that distinguishes which pool a given row belongs to. Every existing
formula (`balancesFromRows`, `computeRecordSettlements`) is reused unmodified,
called twice — once per pool — rather than generalized into something that
understands "two pools" itself.

## Data Model

```prisma
enum LedgerCategory {
  MAINTENANCE
  OTHER_CHARGE
}

model FeeType {
  id          String   @id @default(cuid())
  name        String
  description String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  societyId   String
  society     Society  @relation(fields: [societyId], references: [id])
  otherCharges OtherCharge[]
  @@unique([societyId, name])
  @@index([societyId])
}

model OtherCharge {
  id         String   @id @default(cuid())
  amount     Decimal  @db.Decimal(10, 2)
  note       String?
  dueDate    DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  flatId     String
  flat       Flat     @relation(fields: [flatId], references: [id])
  payerId    String   // always flat.ownerId, resolved server-side
  payer      User     @relation("OtherChargePayer", fields: [payerId], references: [id])
  feeTypeId  String
  feeType    FeeType  @relation(fields: [feeTypeId], references: [id])
  billedById String
  billedBy   User     @relation("OtherChargeBilledBy", fields: [billedById], references: [id])
  @@index([flatId]); @@index([payerId]); @@index([feeTypeId])
}
```

`LedgerEntry` and `PaymentIntent` each gain:
```prisma
category LedgerCategory @default(MAINTENANCE)
```
`PaymentIntent.flatId` **stays field-level `@unique`, unchanged** — no composite
`[flatId, category]` key. This is what enforces "at most one open intent per flat,
regardless of pool" (rule 4 in requirements) at the database level, not just in
application logic.

**Why `FeeType` is a real table, not an enum**: every existing catalog-shaped concept
in this schema (`PayerType`, `LedgerType`, `Role`, ...) is a compile-time Prisma
enum, requiring a migration to extend. Fee types must be addable by an admin without
a deploy, which rules out an enum outright.

**Why `isActive`, not a hard delete**: a billed `OtherCharge` must keep a valid,
named `feeTypeId` reference forever, even after an admin stops offering that fee.
This is this schema's first boolean soft-delete flag — every other "closable"
concept elsewhere uses a timestamp (e.g. `OccupancyChange.effectiveEnd`), but a fee
type has no natural "period it was active for" semantic, so a boolean is the
simplest correct expression.

## Balance Computation — one parameterized function, not two

```ts
// ledger-shared.ts
async function computeFlatBalances(
  flatId: string,
  year?: number,
  category: LedgerCategory = 'MAINTENANCE',
): Promise<FlatBalances> {
  const chargeRows = category === 'MAINTENANCE'
    ? await prisma.maintenanceRecord.findMany({ where: { flatId, ...yearFilter } })
    : await prisma.otherCharge.findMany({ where: { flatId, ...yearFilter } });
  const entries = await prisma.ledgerEntry.findMany({
    where: { flatId, category, ...yearFilter },
  });
  return balancesFromRows(chargeRows, entries); // unchanged, already generic
}
```

Same pattern for `admin-dashboard.service.ts`'s `getBalancesByFlat(societyId,
category = 'MAINTENANCE')`. `balancesFromRows` needs zero signature changes — it was
already generic over `{ amount }[]` before this feature existed. Callers simply
invoke it twice (once per category) rather than it growing a second code path.

### Total Outstanding
```
Total Outstanding = Maintenance Outstanding + Other Charges Outstanding
```
A simple sum of two already-floored-at-zero numbers — never a third independent
computation.

## Settlement status (Unpaid / Partially Settled / Paid)

`computeRecordSettlements(records, totalApprovedFunds)` — unchanged signature, reused
as-is for Other Charges' own FIFO fill, called with only `OtherCharge` rows and only
the Other-Charges pool's approved funds. Because the two pools are never mixed into
one call, there is no cross-type ordering concern to solve (an earlier, rejected
design that *merged* both charge types into one settlement call ran into exactly
this problem — a `MaintenanceRecord`'s `period` string and a same-charge's `dueDate`
don't sort consistently against each other when backfilled records exist; that
problem disappears entirely once the two pools are computed independently).

## Request Flow — billing a charge

```
Admin fills "Bill a charge" form (flat, fee type, amount, note)
        │
        ▼
POST /api/admin/other-charges
        │
        ▼
billOtherCharge(societyId, adminId, {flatId, feeTypeId, amount, note})
  - validate flat + active feeType both belong to societyId
  - payerId = flat.ownerId (server-resolved, never trusts client)
  - dueDate = now + 15 days (same constant as MaintenanceRecord)
        │
        ▼
prisma.$transaction:
  - OtherCharge.create(...)
  - AuditLog.create({ action: 'BILL_OTHER_CHARGE', ... })
        │
        ▼
notify({ eventType: 'OTHER_CHARGE_BILLED', recipient: payerId, ... })
  (non-blocking — try/catch, never rolls back the billing transaction)
```
No `Receipt` is ever created here — Receipts are money-received-only, issued only
when a Deposit/Credit is later approved, 1:1 with `LedgerEntry`.

## Request Flow — paying down an Other Charge

Identical shape to the existing maintenance Pay flow, just carrying `category:
'OTHER_CHARGE'` through every step:

```
Resident's Other Charges Book page → Pay button
        │
        ▼
POST /api/me/ledger/deposits/intent  { amount, category: 'OTHER_CHARGE' }
  - createOrReplacePaymentIntent validates amount against
    computeFlatBalances(flatId, undefined, 'OTHER_CHARGE').outstanding
  - if an intent already exists for a DIFFERENT category →
    IntentAlreadyOpenForOtherCategoryError (409) — blocked, not replaced
        │
        ▼
QR code / bank details shown (same buildPaymentIntentResult, unchanged)
        │
        ▼
Resident submits screenshot → POST .../intent/submit
        │
        ▼
LedgerEntry created (PENDING, category inherited from the intent)
        │
        ▼
Admin approval queue (Payment Proofs) — now shows a Category column
        │
        ▼
approveLedgerEntry — unchanged logic; downstream balance queries already
respect `category`, so approval correctly moves only the matching pool's number
```

## Notification Event

```ts
interface OtherChargeBilledEvent extends NotificationEventBase {
  eventType: 'OTHER_CHARGE_BILLED';
  data: { chargeId, flatId, societyId, feeTypeName, amount, dueDate, note? };
}
```
Added to `NotificationEvent`'s union in `notification.types.ts`. Because
`whatsapp.service.ts`'s `buildTemplate` switch is exhaustive (`const exhaustive:
never = eventType`), adding this event type requires a matching `case` and a new
template file (`templates/other-charge-billed.ts`, mirroring
`maintenance-bill-generated.ts`) to compile — the exhaustiveness check makes this a
compile-time-enforced requirement, not an optional follow-up.

Payment-approval notifications for an Other-Charges Deposit/Credit reuse the
existing `DEPOSIT_PAYMENT_APPROVED`/`CREDIT_PAYMENT_APPROVED` events unchanged — no
new event type needed there.

## Frontend Architecture

| Surface | Pattern reused |
|---|---|
| Fee Types catalog page | `FlatsListPage.tsx`'s list↔form state-swap (`useState<string\|null\|'new'>`), not a modal — matches this app's only existing DataTable-with-add pattern |
| Other Charges billing page | Same list↔form pattern, as its own top-level sidebar route (a primary, repeated admin action — not a dashboard-tile-only drill-down like `/flats`) |
| Other Charges Book (resident) | Mirrors `MaintenanceBookPage.tsx`'s list + settlement badges; reached only via the Dashboard's "Other Outstanding" card, same drill-down convention as admin's `/flat-dues` |
| Pay panel | Reuses `PayIntentPanel`, parameterized by category; shares one intent query with the Maintenance Dashboard (only one intent can ever be open) |

## Key Architectural Decisions
1. **One `category` field, not two parallel schemas.** `LedgerEntry`/`PaymentIntent`
   already had every field an Other-Charges row needs (amount, status, note,
   fileUrl, receipt relation) — duplicating them into `OtherChargeLedgerEntry` etc.
   would have meant re-implementing approve/reject/receipt-issuance/notification
   machinery a second time for no benefit.
2. **Balance functions are parameterized, not duplicated.** `computeFlatBalances`
   and `getBalancesByFlat` each gained one optional, defaulted `category` parameter
   rather than spawning `computeOtherChargeBalances`/`getOtherChargeBalancesByFlat`
   siblings — half the code to maintain, same capability.
3. **One open intent per flat, not per pool.** A deliberate simplification over a
   more "complete" design (independent intents per pool) — removes a whole class of
   edge cases (two QR codes on screen at once, which intent does cancel target) for
   a benefit (paying two pools in true parallel) that's rare at this app's scale.
4. **The two pools' settlement math never touches each other.** No merged FIFO fill,
   no shared sort key, no cross-pool ordering logic — each pool's
   `computeRecordSettlements` call only ever sees that pool's own rows.
5. **Receipts, notifications, and audit logging are extended, not replaced.** Same
   `Receipt` model, same `notify()` entrypoint, same `AuditLog` shape — Other
   Charges is a new *source* of the same kinds of events, not a new subsystem.
