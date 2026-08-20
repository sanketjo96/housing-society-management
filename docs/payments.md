# Payments — ledger model (Phase 6, rebuilt for the 2026-08-06 ledger pivot)

> **Pivot note**: this doc originally described a record-selection payment flow (select
> specific `UNPAID` `MaintenanceRecord`s → pay their exact sum → cascade to `PAID`,
> backed by `PaymentProof`). That flow is **replaced** by the balance-based ledger
> described below — see `CLAUDE.md`'s "Pivot (2026-08-06): resident view moves to a
> transaction ledger" for the full reasoning, including why proof upload is now
> optional and why partial payment is now explicitly allowed. This doc describes the
> *current* flow only; the original design is visible in git history.
>
> **Pivot note (2026-08-07): Credit removed entirely.** Credit (an advance
> deposit/expense reimbursement a resident could log separately from a UPI payment)
> is gone from the product — the society will never use it. `LedgerEntry` only ever
> represents a Deposit now; `POST /api/me/ledger/credits` no longer exists, and the
> balance formula collapsed from three numbers (Outstanding/Credit balance/Payable)
> to one (Outstanding).
>
> **Addendum (2026-08-07, same day): Credit re-introduced, in a different shape.**
> Confirmed against a plain-text credit-allocation spec. `POST /api/me/ledger/credits`
> existed again for a time, but Credit is no longer a separately-netted balance — it's
> pooled with Deposit money and FIFO-allocated across records exactly like a payment
> (see "Settlement status" below), with the leftover exposed as `Available Credit`,
> not the old `Payable` split. See `CLAUDE.md`'s "Credit re-introduced" addendum for
> the full reasoning.
>
> **Pivot (2026-08-20): Credit removed a third time, for good — Deposit's Outstanding
> cap lifted instead.** `POST /api/me/ledger/credits` and everything else described
> below as "Credit" no longer exist. The same effect Credit provided — money beyond
> what's currently owed showing up as `Available Credit` — is now produced for free by
> lifting the Deposit amount cap: a resident may lock/submit any positive amount, and
> the balance formula (unchanged — see "Balance formula" below) already turns an
> overpayment into `availableCredit`. This doc has been updated in place to describe
> the current (Deposit-only, uncapped) contract; see `CLAUDE.md`'s dated pivot for the
> full reasoning.

Reference for the ledger flow: balance computation, UPI QR generation for a
resident-chosen amount, optional proof upload, admin review, and the manual
mark-as-paid fallback. Same route/prefix convention as `docs/auth.md` — every path
below is mounted under `/api/`.

## Storage adapter — `src/lib/storage/`

Unchanged by the ledger pivot. Proof files (screenshots, PDFs) need somewhere to live —
local disk today, potentially S3 or Google Drive later, no rewrite required to switch.
`StorageAdapter` (`types.ts`) is the contract every backend implements:

```ts
export interface StorageAdapter {
  save(input: SaveFileInput): Promise<{ key: string }>;
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}
```

Every method deals in raw bytes only — no adapter tracks mimeType, filenames, or
anything else; that metadata lives on the `LedgerEntry` row instead (`fileUrl` = the
adapter's opaque `key`, now **optional**; `mimeType` = the source of truth for
`Content-Type` when serving the file back). `LocalStorageAdapter` is the only
implementation right now; `getStorageAdapter()` (`index.ts`) is the one place anything
else in the codebase should import from — see `s3`/`gdrive`'s "not implemented yet"
extension points, unchanged.

## UPI link + QR — `src/lib/upi.ts`

Unchanged. `buildUpiDeepLink({ vpa, payeeName, amount, note })` — pure function, the
standard `upi://pay?...` deep link any UPI app recognizes. `generateQrDataUrl(link)`
wraps the `qrcode` npm package and returns a base64 PNG data URL.

## Payment method: UPI or bank transfer, UPI takes precedence (added 2026-08-12)

`Society.upiVpa` is now **optional** — a society may instead (or additionally)
configure `Society.bankAccountNumber` + `Society.bankIfsc`, admin-editable from
Settings → Society details (`docs/data-model.md`'s `Society` section). Both bank
fields are validated together in `society-settings.service.ts`'s
`updateSocietySettings`: PATCHing one without the other already being set (or being
set in the same request) throws `IncompleteBankDetailsError` (`400`) — checked
against the *merged* final state, not the request body alone, since either field can
be omitted on a given PATCH to leave it untouched.

`ledger.service.ts`'s `buildPaymentIntentResult` (backing every
`GET`/`POST /api/me/ledger/deposits/intent` response) picks the payment method for a
given payment intent:

```
if society.upiVpa is set        → paymentMethod: 'UPI', upiLink + qrDataUrl
else if bankAccountNumber+bankIfsc are both set → paymentMethod: 'BANK_TRANSFER', bankAccountNumber + bankIfsc
else                             → throws PaymentMethodNotConfiguredError (409)
```

UPI always wins when both are configured — a resident only ever sees one or the
other, never both. `PaymentIntentResult`'s `upiLink`/`qrDataUrl` and
`bankAccountNumber`/`bankIfsc` are mutually exclusive, keyed off `paymentMethod`.
`PaymentMethodNotConfiguredError` maps to `409` in `ledger.controller.ts` (a
society-configuration gap, not a resident input error — distinct from
`InvalidDepositAmountError`/`InvalidAmountError`'s `400`s) on both the `GET` and
`POST` intent handlers.

## Balance formula — `src/features/ledger/ledger-shared.ts`'s `balancesFromRows`

The one place this formula is computed — reused by both the resident's own Dashboard
(below) and the admin dashboard (`docs/admin-dashboard.md`), so it's never duplicated.
`LedgerEntry` only ever represents a Deposit (Credit removed for good, 2026-08-20
pivot above) — `outstanding` and `availableCredit` are the two sides of the same
subtraction, exactly one of them is ever nonzero:

```
totalCharges     = sum(MaintenanceRecord.amount) for the flat, every row
approvedDeposits = sum(LedgerEntry.amount) where status=APPROVED

outstanding      = max(0, totalCharges - approvedDeposits)
availableCredit  = max(0, approvedDeposits - totalCharges)
```

`computeFlatBalances(flatId)` fetches a single flat's rows and applies the formula;
`admin-dashboard.service.ts` fetches every flat's rows in two bulk society-wide queries
and calls the same pure `balancesFromRows` per flat, avoiding N+1 queries without
duplicating the math.

## Resident's merged ledger — `GET /api/me/ledger`

`OWNER`/`TENANT` only. Replaces the old `GET /api/me/maintenance-records`. Merges the
caller's flat's `MaintenanceRecord`s (rendered as `type: 'SYSTEM'`, always
`status: 'APPROVED'`) with its `LedgerEntry` rows (`type: 'DEPOSIT'`, real
status), sorted newest-first. Response: `{ entries: LedgerRow[], totals: FlatBalances,
yearTotals: FlatBalances, availableYears: number[] }` — `totals` is always
lifetime; `yearTotals` is scoped to an optional `?year=` query param (see
`docs/admin-dashboard.md` and `CLAUDE.md`'s resident-view restructure note). As of
2026-08-07, each SYSTEM row also carries `settledAmount: number` and
`settlementStatus: 'UNPAID' | 'PARTIALLY_SETTLED' | 'PAID'` (see "Settlement status"
below) — undefined on DEPOSIT rows, which have no settlement concept of their own.

## Settlement status — derived per-record Unpaid/Partially Settled/Paid (2026-08-07)

**Additive to the balance formula above, not a replacement.** `Outstanding` is still
the single aggregate number that drives the Pay flow — a resident may lock/submit any
positive amount, no longer capped at Outstanding (2026-08-20 pivot). What's new here
is a *display* concern: which specific months are paid, partially paid, or untouched,
surfaced on Maintenance Book and used by escalation (`docs/admin-dashboard.md`).

`ledger-shared.ts`'s `computeRecordSettlements(records, totalApprovedFunds)` is a pure
function — no DB access, no stored state:

```
sort records oldest-to-newest by `period`
remaining = totalApprovedFunds (one lump sum — the flat's current approvedDeposits,
            not a per-row history)
for each record, oldest first:
  settledAmount = min(remaining, record.amount)
  remaining -= settledAmount
  status = settledAmount == 0 ? UNPAID
         : settledAmount == record.amount ? PAID
         : PARTIALLY_SETTLED
```

**Why a lump sum is enough — no need to track which Deposit paid which record.**
Filling strictly from the front (oldest record first) is order-independent: applying
two contributions A-then-B produces the exact same final per-record state as B-then-A,
or one payment of `A+B`. So the computation only ever needs `records` and the flat's
current `approvedDeposits` total (already computed by `computeFlatBalances`/
`balancesFromRows` above) — recomputed fresh on every read, the same "never stored as
a running total" principle as `Outstanding` itself. This is also exactly what makes
"a resident overpays past Outstanding" and "Available Credit is auto-consumed by a
newly-generated due" work with zero extra code — rerunning this same fill against a
larger record set naturally lands leftover funds on the new record.

`getLedgerForResident` always runs the fill against the flat's **lifetime** records
and **lifetime** `approvedDeposits` (never `yearTotals`), then attaches the result
only to the SYSTEM rows actually being returned (which may be year-filtered) — a
record's settlement depends on its position in the full history, not on whichever
year the resident happens to be browsing.

## Resident Deposit submission — `POST /api/me/ledger/deposits`

Lower-level, one-shot primitive — kept unremoved even though the resident-facing Pay
UI now goes through the payment-intent endpoints (`POST`/`GET`/`DELETE
/api/me/ledger/deposits/intent`, `POST .../intent/submit` — see
`docs/maintenance-records.md`/`CLAUDE.md`'s resident-view restructure note for the
full intent-lock flow). `multipart/form-data`: an `amount` field, plus an **optional**
`file` field (image/PDF, same server-side validation —
`src/middleware/proof-upload.ts`). Proof is not mandatory here. Re-validated
server-side as `amount > 0` only — no longer capped at Outstanding (2026-08-20
pivot; never trust the client either way) — `400` if `<= 0`. Any amount beyond the
current Outstanding settles it in full once approved, with the remainder surfacing as
`Available Credit` (see "Balance formula" above).

Creates one `LedgerEntry{status: PENDING}`, one `AuditLog` row (`action:
'SUBMIT_DEPOSIT'`). **Does not touch any `MaintenanceRecord`** — there's nothing to
cascade; the balance simply doesn't move until an admin approves.

## Authenticated file access — `GET /api/ledger-entries/:id/file`

Replaces `GET /api/payment-proofs/:id/file`. Same rule as before: `ADMIN`/`OWNER`/
`TENANT`, never public. `404` if the entry doesn't exist, belongs to a different
society, or has no file attached; `403` if it exists but the caller is neither an admin
nor the entry's own payer.

## Admin review queue — `GET /api/admin/ledger-entries`

Replaces `GET /api/admin/payment-proofs`. Admin-only. Optional `?status=` filter.
Each entry includes `payer` (id/name/email) and `flat` (id/wing/flatNumber) —
simpler than before, since an entry is never linked to multiple records.

## Approve — `POST /api/admin/ledger-entries/:id/approve`

Admin-only. `404` if not found/wrong society, `409` if not currently `PENDING`. **Much
simpler than the pre-pivot flow**: flips one row's `status` → `APPROVED`
(`reviewedById`/`reviewedAt` set), one `AuditLog` row — `action: 'APPROVE_DEPOSIT'` —
no cascade to any `MaintenanceRecord`, since there's nothing linked. The balance
simply reflects the newly-approved amount on the next read.

**Also issues a receipt (2026-08-11 addendum).** The frontend no longer calls this
endpoint directly from an "Approve" click — it first fetches a PDF preview from
`GET /api/admin/ledger-entries/:id/receipt-preview` and shows it in a confirmation
modal; only "Confirm and approve" actually calls this endpoint, which is also the
point a `Receipt` row is created and its PDF saved. See `docs/receipts.md` for the
full contract; nothing about this endpoint's request/response shape changed, only
what happens inside it.

## Reject — `POST /api/admin/ledger-entries/:id/reject`

Admin-only. **Request**: `{ reason?: string }` → stored as `adminNote`. Same `404`/`409`
cases as approve. Flips `status` → `REJECTED`, one `AuditLog` row (`action:
'REJECT_DEPOSIT'`). No revert-to-`UNPAID` step needed (there's no record
cascade) — the resident simply sees the rejected row and may submit a new Deposit.

**Not yet wired to an actual notification** — same gap as pre-pivot, still Phase 7's
scope, not built here.

## Manual mark-as-paid fallback — `POST /api/admin/ledger-entries/manual-deposit`

Admin-only, for cash/bank-transfer edge cases — no proof involved. **Request**:
`{ flatId: string, amount: number }`. Directly creates an already-`APPROVED`
`LedgerEntry`, `payerId` = the flat's current tenant (or owner if owner-occupied) —
matching the recipient logic used elsewhere (escalation messages, etc.). **Logged as
`MANUAL_MARK_PAID`**, same distinct audit action name as the pre-pivot flow (rule 7's
explicit requirement that this stay distinguishable from QR-flow approvals), one
`AuditLog` row. Also issues a receipt, same as the Approve endpoint (2026-08-11
addendum, `docs/receipts.md`) — a cash/bank payment gets one just as a UPI deposit
does, with no preview step (there's no `PENDING` state here to preview against
before committing).

## Frontend — resident payment flow (`client/src/pages/MaintenanceBookPage.tsx`)

Corrected file path (2026-08-20) — the resident-dashboard restructure moved the Pay
flow off `ResidentDashboardOverview.tsx` (now a pure 4-card navigation hub) onto this
page some time before this doc was updated to match. Two summary cards —
**Total maintenance amount** and **Maintenance Outstanding** — above the Bills tab's
"You owe ₹X" row (or "Nothing outstanding right now"), an **amount field + Pay
button** when Outstanding > 0 (see `docs/maintenance-records.md`'s intent-lock flow).
Below (Payments tab): the Deposit ledger as a `DataTable`
(`client/src/components/DataTable.tsx`) — Date / Amount / Status, with
`ApprovalBadge` (Approved/Pending/Rejected) pills. No Type column — every row is a
Deposit (Credit removed for good, 2026-08-20 pivot).

**Amount field**: a number input pre-filled with the full `outstanding`,
re-defaulted whenever the ledger query result changes — e.g. after a prior payment is
approved and the resident opens Pay again — but never clobbering an in-progress edit
otherwise. Client-side validated as `amount > 0` only (Pay disabled + an inline error
below that) — no longer capped at Outstanding (2026-08-20 pivot), purely for UX;
`createOrReplacePaymentIntent` enforces the exact same `> 0` rule server-side
regardless of what the client sends. When the entered amount exceeds Outstanding, an
inline hint shows the excess that will become Available Credit once approved. Once
locked, the amount becomes read-only (`PayIntentPanel` only ever displays it, never
edits it) — editability is only at the entry step, before locking.

**`PayIntentPanel` branches on `intent.paymentMethod` (added 2026-08-12)**: a
`'UPI'` intent renders exactly as before (QR image on desktop, deep-link redirect on
mobile via `lockMutation`'s `window.location.href = intent.upiLink`, now guarded on
`upiLink` actually being present). A `'BANK_TRANSFER'` intent instead shows the
account number and IFSC in a bordered detail box (on every device — there's no app
to deep-link into) and swaps the guideline copy to "Transfer the amount via
NEFT/IMPS/RTGS to the account details above, then attach a screenshot or the
transaction reference below." The screenshot-upload/submit/cancel controls
underneath are unchanged either way — proof is still attached the same way
regardless of payment method.

## Frontend — admin review queue (`client/src/pages/admin/PaymentProofsPage.tsx`)

Same "Payment proofs" tab, now querying `/api/admin/ledger-entries*`. Table of pending
entries (flat, payer, amount), "View proof" only shown when `fileUrl` is set (shows
"No file attached" otherwise — a real, valid state for a fileless Deposit, e.g. a
manually-marked-paid entry), "Approve", and "Reject" (inline optional-reason field,
unchanged pattern). No Type column — every row is a Deposit (Credit removed for good,
2026-08-20 pivot). Simpler than before: no `maintenanceRecords` list to render per
row, since an entry is never linked to multiple records.

**2026-08-11 addendum**: the page gained a Pending/Approved/Rejected status tab
(querying the same endpoint with a different `?status=`), Approve now opens a
receipt-preview modal instead of settling directly, and Approved rows show a
"Download receipt" action. Full detail: `docs/receipts.md`.

## Manually verified against the real running stack

```sh
# Resident's merged ledger
curl http://localhost/api/me/ledger -H "Authorization: Bearer <ownerToken>"
# → 200, { entries: [...], totals: { totalCharges, approvedDeposits,
#          outstanding, availableCredit }, yearTotals: {...}, availableYears: [...] }

# Deposit submission, no proof file, amount above current Outstanding — accepted
curl -X POST http://localhost/api/me/ledger/deposits \
  -H "Authorization: Bearer <ownerToken>" -F "amount=999999"
# → 201, { id, status: "PENDING", fileUrl: null }

# Admin approves — the excess over Outstanding becomes Available Credit
curl -X POST http://localhost/api/admin/ledger-entries/<entryId>/approve \
  -H "Authorization: Bearer <adminToken>"
# → 200, { status: "APPROVED", ... }; the resident's Outstanding/Available Credit
#   reflects the newly-approved amount on next read
```

Read-only/throwaway-data verification — no seeded demo data was left mutated.
