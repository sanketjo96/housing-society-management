# Payments — ledger model (Phase 6, rebuilt for the 2026-08-06 ledger pivot)

> **Pivot note**: this doc originally described a record-selection payment flow (select
> specific `UNPAID` `MaintenanceRecord`s → pay their exact sum → cascade to `PAID`,
> backed by `PaymentProof`). That flow is **replaced** by the balance-based ledger
> described below — see `CLAUDE.md`'s "Pivot (2026-08-06): resident view moves to a
> transaction ledger" for the full reasoning, including why proof upload is now
> optional and why partial payment is now explicitly allowed. This doc describes the
> *current* flow only; the original design is visible in git history.

Reference for the ledger flow: balance computation, UPI QR generation for a
resident-chosen amount, optional proof upload, Credit logging, admin review, and the
manual mark-as-paid fallback. Same route/prefix convention as `docs/auth.md` — every
path below is mounted under `/api/`.

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

## Balance formula — `src/services/ledger.service.ts`'s `balancesFromRows`

The one place this formula is computed — reused by both the resident's own Passbook
(below) and the admin dashboard (`docs/admin-dashboard.md`), so it's never duplicated:

```
totalCharges     = sum(MaintenanceRecord.amount) for the flat, every row
approvedDeposits = sum(LedgerEntry.amount) where type=DEPOSIT, status=APPROVED
approvedCredits  = sum(LedgerEntry.amount) where type=CREDIT,  status=APPROVED

outstanding   = max(0, totalCharges - approvedDeposits)
creditBalance = approvedCredits
payable       = max(0, outstanding - creditBalance)
```

`computeFlatBalances(flatId)` fetches a single flat's rows and applies the formula;
`admin-dashboard.service.ts` fetches every flat's rows in two bulk society-wide queries
and calls the same pure `balancesFromRows` per flat, avoiding N+1 queries without
duplicating the math.

## Resident's merged ledger — `GET /api/me/ledger`

`OWNER`/`TENANT` only. Replaces the old `GET /api/me/maintenance-records`. Merges the
caller's flat's `MaintenanceRecord`s (rendered as `type: 'SYSTEM'`, always
`status: 'APPROVED'`) with its `LedgerEntry` rows (`DEPOSIT`/`CREDIT`, real status),
sorted newest-first. Response: `{ entries: LedgerRow[], totals: FlatBalances }`.

## Resident QR generation — `POST /api/me/ledger/deposits/qr`

Replaces `POST /api/me/maintenance-records/qr`. **Request**: `{ amount: number }` —
a resident-chosen amount, not a list of record ids. **Response**: `{ amount, upiLink,
qrDataUrl }`. Re-validated server-side as `0 < amount <= payable` (never trust the
client's cap) — `400` if out of range. Stateless, no DB write, same as before.

## Resident Deposit submission — `POST /api/me/ledger/deposits`

Replaces `POST /api/me/payment-proofs`. `multipart/form-data`: an `amount` field, plus
an **optional** `file` field (image/PDF, same server-side validation as before —
`src/middleware/proof-upload.ts`, unchanged). **Proof is no longer mandatory** — a
deliberate reversal of the pre-pivot rule; the resident-experience mockup's "Upload
payment proof" button is decorative/unwired, and the written spec's Pay flow only
requires the amount.

Creates one `LedgerEntry{type: DEPOSIT, status: PENDING}`, one `AuditLog` row
(`action: 'SUBMIT_DEPOSIT'`). **Does not touch any `MaintenanceRecord`** — unlike the
pre-pivot flow, there's nothing to cascade to `PENDING_REVIEW`; the balance simply
doesn't move until an admin approves.

## Resident Credit submission — `POST /api/me/ledger/credits`

New — covers "advance deposit" and "expense reimbursement" in one action (the written
spec's explicit requirement). `multipart/form-data`: `amount` and `note` required, `file`
optional. Creates one `LedgerEntry{type: CREDIT, status: PENDING}`, one `AuditLog` row
(`action: 'SUBMIT_CREDIT'`).

## Authenticated file access — `GET /api/ledger-entries/:id/file`

Replaces `GET /api/payment-proofs/:id/file`. Same rule as before: `ADMIN`/`OWNER`/
`TENANT`, never public. `404` if the entry doesn't exist, belongs to a different
society, or has no file attached; `403` if it exists but the caller is neither an admin
nor the entry's own payer.

## Admin review queue — `GET /api/admin/ledger-entries`

Replaces `GET /api/admin/payment-proofs`. Admin-only. Optional `?status=`/`?type=`
filters. Each entry includes `payer` (id/name/email) and `flat` (id/wing/flatNumber) —
simpler than before, since an entry is never linked to multiple records.

## Approve — `POST /api/admin/ledger-entries/:id/approve`

Admin-only. `404` if not found/wrong society, `409` if not currently `PENDING`. **Much
simpler than the pre-pivot flow**: flips one row's `status` → `APPROVED`
(`reviewedById`/`reviewedAt` set), one `AuditLog` row (`APPROVE_DEPOSIT` or
`APPROVE_CREDIT`, by entry type) — no cascade to any `MaintenanceRecord`, since there's
nothing linked. The balance simply reflects the newly-approved amount on the next read.

## Reject — `POST /api/admin/ledger-entries/:id/reject`

Admin-only. **Request**: `{ reason?: string }` → stored as `adminNote`. Same `404`/`409`
cases as approve. Flips `status` → `REJECTED`, one `AuditLog` row (`REJECT_DEPOSIT` or
`REJECT_CREDIT`). No revert-to-`UNPAID` step needed (there's no record cascade) — the
resident simply sees the rejected row and may submit a new Deposit/Credit.

**Not yet wired to an actual notification** — same gap as pre-pivot, still Phase 7's
scope, not built here.

## Manual mark-as-paid fallback — `POST /api/admin/ledger-entries/manual-deposit`

Admin-only, for cash/bank-transfer edge cases — no proof involved. **Request**:
`{ flatId: string, amount: number }`. Directly creates an already-`APPROVED`
`LedgerEntry{type: DEPOSIT}`, `payerId` = the flat's current tenant (or owner if
owner-occupied) — matching the recipient logic used elsewhere (escalation messages,
etc.). **Logged as `MANUAL_MARK_PAID`**, same distinct audit action name as the
pre-pivot flow (rule 7's explicit requirement that this stay distinguishable from
QR-flow approvals), one `AuditLog` row.

## Frontend — resident payment flow (`client/src/pages/PassbookPage.tsx`)

Replaces `MaintenancePage.tsx`. Three summary cards — Outstanding, Credit balance,
**Payable** (visually emphasized, dark/inverted card) — above a card showing "You owe
₹X after approved credit" (or "Nothing payable right now"), with **Add credit**
(always visible, opens a modal — `client/src/components/Modal.tsx`, new) and **Pay**
(only when Payable > 0, expands an inline panel: QR for the entered amount, pre-filled
with the full Payable but freely editable down to any smaller amount, an optional file
input, "Submit payment"). Below: the merged ledger as a `DataTable`
(`client/src/components/DataTable.tsx`) — Date / Payer / Type / Amount / Status, with
`TypeBadge` (System/Deposit/Credit) and `ApprovalBadge` (Approved/Pending/Rejected)
pills using this app's existing color tokens.

## Frontend — admin review queue (`client/src/pages/admin/PaymentProofsPage.tsx`)

Same "Payment proofs" tab, now querying `/api/admin/ledger-entries*`. Table of pending
entries (flat, payer, type, amount, note), "View proof" only shown when `fileUrl` is
set (shows "No file attached" otherwise — a real, valid state now that proof is
optional), "Approve", and "Reject" (inline optional-reason field, unchanged pattern).
Simpler than before: no `maintenanceRecords` list to render per row, since an entry is
never linked to multiple records.

## Manually verified against the real running stack

```sh
# Resident's merged ledger
curl http://localhost/api/me/ledger -H "Authorization: Bearer <ownerToken>"
# → 200, { entries: [...], totals: { totalCharges, approvedDeposits, approvedCredits,
#          outstanding, creditBalance, payable } }

# QR for a partial amount
curl -X POST http://localhost/api/me/ledger/deposits/qr \
  -H "Content-Type: application/json" -H "Authorization: Bearer <ownerToken>" \
  -d '{"amount": 500}'
# → 200, { amount: 500, upiLink: "upi://pay?...", qrDataUrl: "data:image/png;base64,..." }

# Deposit submission, no proof file
curl -X POST http://localhost/api/me/ledger/deposits \
  -H "Authorization: Bearer <ownerToken>" -F "amount=500"
# → 201, { id, status: "PENDING", fileUrl: null }

# Admin approves
curl -X POST http://localhost/api/admin/ledger-entries/<entryId>/approve \
  -H "Authorization: Bearer <adminToken>"
# → 200, { status: "APPROVED", ... }; the resident's Payable drops by 500 on next read
```

Read-only/throwaway-data verification — no seeded demo data was left mutated.
