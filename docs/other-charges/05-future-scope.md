# Other Charges — Future Scope

Everything below is **deliberately not built in v1**. Documented so the path is
clear if a real need appears — not so it gets scheduled prematurely. Re-read
[`01-requirements.md`](./01-requirements.md) before starting any item here to
confirm the trigger is real, not anticipated (same discipline
`docs/observablity/06-future-scope.md` applies to its own deferred items).

## 1. Bulk / Multi-Flat Billing
**What**: select multiple flats/owners and bill the same fee to all of them in one
action (e.g. a society-wide fine or a common event fee).
**Trigger**: an admin needs to bill the same charge to more than a handful of flats
often enough that repeating the one-flat-at-a-time action becomes real friction.
**Why not now**: no bulk-select UI pattern exists anywhere in this app today (checked
exhaustively — `DataTable.tsx` has an unused checkbox-column hook, never built out).
Building it just for this feature would be new UI infrastructure, not a small
addition.
**Cost to add**: a real chunk of work — a checkbox-column DataTable pattern (new),
plus a backend endpoint that creates N `OtherCharge` rows in one transaction.

## 2. Tenant as Payer
**What**: let an admin choose whether an Other Charge bills the owner or the current
tenant, mirroring `MaintenanceRecord`'s `payerType`.
**Trigger**: a real charge type emerges that should legitimately target a tenant
(e.g. a tenant-caused damage fine) rather than the owner.
**Why not now**: confirmed as owner-only during design — every charge type discussed
(joining fee, transfer fee, fine) is naturally owner-level.
**Cost to add**: moderate — `OtherCharge` gains a `payerType` field, the billing form
gains a toggle, and `billOtherCharge` stops unconditionally resolving `flat.ownerId`.

## 3. Editing or Voiding a Charge After Billing
**What**: correct a mis-entered amount or fee type, or cancel a charge entirely,
after it's already been billed.
**Trigger**: a real mis-billing incident where the existing workaround (a
maintenance-style Credit, once/if Other-Charges Credit exists — see item 4) is
judged insufficient.
**Why not now**: `OtherCharge` follows `MaintenanceRecord`'s existing "immutable once
created" convention — this app has no precedent for editing a charge row, only for
offsetting it with a countervailing entry.
**Cost to add**: needs its own design pass — an edit changes historical settlement
math retroactively in a way a Credit doesn't; not a small addition.

## 4. Credit Requests Scoped to Other Charges
**What**: let a resident request a committee-approved adjustment (the existing
Credit mechanism) against Other Charges Outstanding, not just Maintenance
Outstanding.
**Trigger**: a real dispute over a billed charge (e.g. a fine the owner contests)
that needs an adjustment mechanism, not just a payment.
**Why not now**: the confirmed v1 scope was specifically a Pay/payment-intent flow
for Other Charges — Credit was never part of that ask.
**Cost to add**: small — `createCredit` already takes a `role` param (added for the
`createdByType` provenance feature); adding a `category` param follows the exact
same pattern already used for Deposit.

## 5. Escalation Extended to Other Charges
**What**: `getFlaggedFlats` also flags a flat whose Other Charges Outstanding is
overdue past the grace period, alongside its existing maintenance-only check.
**Trigger**: an admin actually needs a reminder nudge for unpaid Other Charges, not
just maintenance dues (e.g. an unpaid transfer fee sitting for months unnoticed).
**Why not now**: confirmed out of scope for v1 — escalation's current shape
(`recordsByFlat` keyed purely off `MaintenanceRecord`) is left untouched
deliberately, avoiding the exact kind of over-reach that caused the original
(rejected) merged-pool design.
**Cost to add**: moderate — `getFlaggedFlats` would need to run its overdue check
against both pools independently and decide how to combine/prioritize two possible
overdue reasons in one flagged-flat message.

## 6. Per-Charge / Per-Fee-Type Due Date or Grace Period
**What**: let an admin set a custom due date when billing a charge, or configure a
default grace period per fee type, instead of the fixed 15-day convention inherited
from `MaintenanceRecord`.
**Trigger**: a real fee type where 15 days is clearly wrong (e.g. a transfer fee
that's conventionally due in 30 days).
**Cost to add**: small — `dueDate` is already a real column on `OtherCharge`; this
is a UI/validation addition, not a schema change.

## 7. CSV Bulk Import of Charges
**What**: mirror `FlatsListPage`'s CSV import for onboarding many charges at once.
**Trigger**: not requested, and cuts against the confirmed "one flat at a time"
decision — would need its own explicit re-confirmation before building.

## 8. Default/Suggested Amount on a Fee Type
**What**: `FeeType` gains a `defaultAmount` that pre-fills (but doesn't lock) the
billing form's amount field, matching `Society.defaultBaseRate`'s "pre-fill only,
never enforced" precedent.
**Trigger**: admins consistently re-type the same amount for a given fee type often
enough that pre-filling saves real friction.
**Cost to add**: small — one nullable column, one form default.

## 9. Hard Delete of a Fee Type
**Not planned, ever** — by design. A `FeeType` referenced by a past `OtherCharge`
must never disappear; `isActive` is the only removal mechanism, permanently.

## Guiding Rule for All of the Above
Don't build any item in this document until the specific trigger listed next to it
has actually happened. If a trigger does occur, re-confirm the exact shape with the
user before implementing — several items here (especially 2, 3, and 5) interact with
already-confirmed v1 scope decisions and shouldn't be assumed to still hold their
original boundaries without a fresh check.
