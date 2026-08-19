# Other Charges — Requirements

## Context
- App: Society management system (24 flats, 2 personas — Admin, Resident)
- Today the only way money is billed to a resident is the monthly `MaintenanceRecord`
  generation cron — there is no way for an admin to bill a one-off fee (joining fee,
  fine, transfer fee) outside that cycle.
- Goal: let an admin (a) maintain a configurable catalog of fee types, and (b) bill a
  specific amount of a specific fee type to a specific flat's owner, from a dedicated
  page — without disturbing the existing maintenance-dues Outstanding figure or its
  settlement/escalation machinery.

## Problem Statement
An admin currently has no mechanism to bill anything other than the recurring
monthly maintenance charge. Ad-hoc charges (joining fee, transfer fee, a fine) are
either tracked outside the system entirely or improvised as a manual note — neither
is auditable, neither shows up in a resident's balance, and neither is payable
through the app's existing UPI/bank-transfer flow.

## Confirmed Product Decisions
These were explicitly settled (not defaults) during design discussion and should not
be re-litigated without a new conversation:

1. **Payer is always the flat's owner** — never the tenant. Joining fee, transfer
   fee, and fines are owner-level administrative events, not occupancy-based like
   maintenance.
2. **Billing is one flat at a time** — no bulk/multi-select billing UI. To bill the
   same fee to multiple owners, the admin repeats the action per flat.
3. **Other Charges is a fully separate track from maintenance dues** — this was a
   deliberate reversal of an earlier design (which merged `OtherCharge` into the same
   settlement/FIFO pool as `MaintenanceRecord`) after it was explicitly rejected.
   Other Charges must have:
   - its own Outstanding figure (never combined into the existing maintenance
     Outstanding number),
   - its own dashboard cards (admin: "Outstanding Other Charges" + "Total
     Outstanding"; resident: "Other Outstanding" + "Total Outstanding"),
   - its own record list (a "book" page, structurally similar to Maintenance Book),
   - and its own Pay flow, ending in the same admin approval queue used for
     maintenance Deposits/Credits (not a new review mechanism).
4. **A resident has at most one open payment intent at a time, period** — not one
   per pool. Starting a payment for the other pool while one is already open blocks
   with an error rather than silently replacing the in-flight one. This was a
   deliberate simplification: the alternative (independent intents per pool) was
   considered and rejected as unnecessary complexity for a rare scenario at this
   app's scale.

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| R1 | Admin can create, rename, and deactivate fee types (a named catalog entry, e.g. "Transfer Fee") without a code deploy | Must |
| R2 | A deactivated fee type is excluded from the billing form but never deleted — past charges must keep a valid, named reference | Must |
| R3 | Admin can bill a specific amount of a specific fee type to a specific flat, in one action, from a dedicated page | Must |
| R4 | A billed charge is always attributed to the flat's owner, resolved server-side — never client-suppliable | Must |
| R5 | A billed charge is immutable once created — no edit/void endpoint in this phase | Must |
| R6 | Other Charges contributes to its own Outstanding figure, entirely independent of the maintenance Outstanding figure | Must |
| R7 | A resident can pay down Other Charges Outstanding via the same UPI QR / bank-transfer flow as maintenance, but as a separate payment intent scoped to this pool | Must |
| R8 | An Other-Charges Deposit goes through the same PENDING → APPROVED/REJECTED admin review queue as a maintenance Deposit, visibly tagged by pool | Must |
| R9 | Admin Dashboard shows "Outstanding Other Charges" and "Total Outstanding" (= maintenance + other) as new summary cards | Must |
| R10 | Resident Dashboard shows "Other Outstanding" and "Total Outstanding" as new summary cards, alongside the existing (relabeled) "Maintenance Outstanding" | Must |
| R11 | Clicking the resident's "Other Outstanding" card opens a book page listing Other Charge records with derived settlement status (Unpaid/Partially Settled/Paid), same UX pattern as Maintenance Book | Must |
| R12 | A resident cannot have two payment intents open simultaneously (one per pool) — starting a second is blocked with a clear error, not silently replaced | Must |
| R13 | An admin's manual cash/bank-transfer entry (`manualDeposit`) can be recorded against either pool | Should |
| R14 | Billing a charge fires a notification to the owner (`OTHER_CHARGE_BILLED`), following the same non-blocking `notify()` pattern already used for maintenance bills | Should |
| R15 | A receipt issued for an Other-Charges payment reads "Other charges payment" as its purpose line, distinct from maintenance's "Maintenance dues payment" | Should |

## Non-Functional Requirements
- **No schema-shape duplication**: the balance/settlement math (`balancesFromRows`,
  `computeRecordSettlements`) must be reused unmodified — the two pools are
  distinguished by which rows are fed into these functions, not by a second set of
  formulas.
- **Backward compatibility**: every existing maintenance-only code path (routes,
  service functions, `PaymentIntent`'s one-per-flat behavior) must continue to work
  with zero client-visible change when Other Charges is never used.
- **Auditability**: billing a charge, and any payment toward it, leaves the same
  `AuditLog` trail convention already used for maintenance actions (distinct action
  names, e.g. `BILL_OTHER_CHARGE`).
- **Correctness over scale**: 24-flat MVP — no new infrastructure, no pagination, no
  bulk operations beyond what's explicitly required above.

## Explicitly Out of Scope (v1)
- Bulk/multi-flat billing of the same fee
- Tenant as payer (owner only, no payer-type toggle)
- Editing or voiding a charge after billing (use a maintenance-style Credit-equivalent
  workaround if ever needed — not built in v1)
- Credit requests scoped to Other Charges — Credit (the committee-approved
  adjustment mechanism) stays maintenance-only in v1
- Escalation (`getFlaggedFlats` / overdue-flat flagging) extended to Other Charges —
  stays maintenance-only in v1
- Per-charge or per-fee-type custom due date/grace period (fixed 15-day convention,
  matching `MaintenanceRecord`)
- CSV bulk import of charges
- A default/suggested amount on a fee type
- Hard delete of a fee type

These are tracked with their trigger conditions in
[`05-future-scope.md`](./05-future-scope.md) — revisit only if a concrete need
appears, not on a schedule.

## Success Criteria
- An admin can add "Transfer Fee" to the catalog and bill ₹5,000 of it to a specific
  flat's owner in under a minute, with zero effect on that flat's maintenance
  Outstanding.
- A resident sees "Other Outstanding" as a distinct number from "Maintenance
  Outstanding" on their Dashboard, and can pay either down independently without
  the two ever being conflated in one balance.
- An admin reviewing Payment Proofs can tell at a glance whether a pending entry is
  for Maintenance or an Other Charge.
