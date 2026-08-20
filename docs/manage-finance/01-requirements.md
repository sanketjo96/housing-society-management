# Manage Finance — Requirements

## Context
- App: Society management system (24 flats, 2 personas — Admin, Resident)
- A financial-audit-readiness review of the schema flagged a real gap: nothing in
  this app models money the society itself moves outside the resident-billing
  cycle — vendor bills, salaries, repairs (expense) or bank interest, common-area
  rental, donations (income).
- Goal: let an admin record every such transaction from a dedicated "Manage
  Finance" page, backed by a new, deliberately separate model
  (`SocietyLedgerEntry`), without disturbing the existing resident-centric ledger
  or its Outstanding/settlement machinery in any way.

## Problem Statement
The existing `LedgerEntry` model is resident-centric: every row always carries a
`flatId`/`payerId` and settles a specific flat's own Outstanding balance. It has
no way to represent a transaction that isn't tied to any flat — an admin paying
the electricity bill, or the society receiving bank interest, currently has
nowhere to go in this app at all.

## Confirmed Product Decisions
These were explicitly settled (not defaults) during design discussion and should
not be re-litigated without a new conversation:

1. **Single-admin entry, immutable once created** — no two-person approval
   workflow. Matches `OtherCharge`'s existing precedent exactly: an admin records
   a transaction, it's final immediately, no PENDING/APPROVED review queue.
2. **One combined form with a direction toggle**, not two separate Income/Expense
   flows — one "Manage Finance" page, one form (Income/Expense selector), one
   combined history list.
3. **A new category catalog, `SocietyLedgerCategory`, separate from `FeeType`.**
   `FeeType` is resident-billing-specific ("Transfer Fee", "Joining Fee") — a
   society-level head like "Electricity" or "Bank Interest" doesn't belong there.
   Each category is bound to one direction (a head like "Electricity" is
   inherently an expense head); an entry's own direction must match its chosen
   category's direction.
4. **A `SocietyLedgerPaymentMethod` covering Cash, Bank Transfer, UPI, Cheque, and
   Other.** Unlike a resident Deposit (always UPI in practice), a society expense
   is legitimately paid multiple ways, including with no bank trail at all.
5. **`bankReference` is required unless payment method is Cash.** This directly
   closes the bank-statement-reconciliation gap the audit review flagged, without
   blocking a legitimate cash transaction.
6. **A proof/document attachment is mandatory**, not optional — mirrors
   `LedgerEntry`'s Credit path (an arbitrary discretionary amount needs
   independent evidence, not just a self-reported figure). Every transaction here
   is an admin unilaterally recording money in or out; every one needs evidence.
7. **A `transactionDate` field, distinct from `createdAt`.** The date the money
   actually moved, not the date an admin got around to entering it — a specific
   audit-readiness finding (`manualDeposit`'s lack of this distinction was
   flagged as a gap), built in correctly here from day one.
8. **No settlement/FIFO/PaymentIntent machinery at all.** A `SocietyLedgerEntry`
   is a complete, already-true transaction record the moment it's created — same
   shape as `manualDeposit`/`billOtherCharge`, not the Deposit's PENDING-then-
   reviewed shape. There is no "outstanding balance being paid down" concept here.
9. **The dashboard's "Net" figure must not overclaim accuracy.** It's computed
   purely from `SocietyLedgerEntry` rows and labeled "recorded since tracking
   began" — not presented as the society's live bank balance, since there's no
   admin-configurable opening balance to anchor it to one.

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| R1 | Admin can create, and activate/deactivate, income/expense categories (a named catalog entry bound to one direction, e.g. "Electricity" = Expense) without a code deploy | Must |
| R2 | A deactivated category is excluded from the recording form but never deleted — past entries must keep a valid, named reference | Must |
| R3 | Admin can record a society income or expense transaction — direction, category, amount, transaction date, payment method, conditionally-required bank reference, mandatory proof, optional note — in one action, from a dedicated page | Must |
| R4 | A recorded entry's direction must match its chosen category's direction — mismatched combinations are rejected | Must |
| R5 | `bankReference` is required unless `paymentMethod` is Cash | Must |
| R6 | A proof attachment (bill, invoice, or receipt) is mandatory for every entry | Must |
| R7 | A recorded entry is immutable once created — no edit/void endpoint in this phase | Must |
| R8 | The admin Dashboard shows Total Income, Total Expense, and Net (Income − Expense) as new summary cards, computed purely from `SocietyLedgerEntry` | Must |
| R9 | An admin can download a recorded entry's proof attachment via an authenticated endpoint | Must |
| R10 | "Manage Finance" is a full sidebar nav item (a primary write action), not a dashboard-tile-only drill-down | Must |

## Non-Functional Requirements
- **No settlement-math duplication**: `balancesFromRows`/`computeRecordSettlements`/
  `computeFlatBalances` (`ledger-shared.ts`) need zero changes — this feature has
  no settlement concept at all, and nothing here reads or writes `LedgerEntry`,
  `MaintenanceRecord`, or `OtherCharge`.
- **Backward compatibility**: every existing resident-billing code path continues
  to work with zero client-visible change; this feature is purely additive.
- **Auditability**: recording a transaction leaves the same `AuditLog` trail
  convention already used elsewhere (`RECORD_SOCIETY_LEDGER_ENTRY`).
- **Correctness over scale**: 24-flat MVP — no new infrastructure, no
  pagination, no bulk operations beyond what's explicitly required above.

## Explicitly Out of Scope (v1)
- A two-person approval workflow for `SocietyLedgerEntry`
- Category rename (create + activate/deactivate only)
- An admin-configurable opening balance on `Society` (would turn "Net" into a
  true running bank balance)
- CSV export of transaction history
- Recurring/scheduled expenses (e.g. a monthly salary that shouldn't need
  manual re-entry)

These are tracked with their trigger conditions in
[`05-future-scope.md`](./05-future-scope.md) — revisit only if a concrete need
appears, not on a schedule.

## Success Criteria
- An admin can add "Electricity" as an Expense category and record a ₹4,000
  payment against it — with a bank reference, a proof attachment, and a
  transaction date — in under a minute, with zero effect on any resident's
  balance.
- Recording an Income entry against an Expense-direction category (or vice
  versa) is rejected with a clear error.
- The admin Dashboard shows Total Income/Total Expense/Net as a distinct card
  group, clearly separate from the resident-billing "Finance"/"Maintenance"/
  "Other Charges" groups already there.
- A recorded entry's proof attachment is downloadable by an admin, and by no one
  else.
