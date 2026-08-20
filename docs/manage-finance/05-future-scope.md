# Manage Finance — Future Scope

Everything below is **deliberately not built in v1**. Documented so the path is
clear if a real need appears — not so it gets scheduled prematurely. Re-read
[`01-requirements.md`](./01-requirements.md) before starting any item here to
confirm the trigger is real, not anticipated (same discipline
`docs/other-charges/05-future-scope.md` applies to its own deferred items).

## 1. Two-Person Approval Workflow
**What**: a `PENDING`/`APPROVED` review queue for `SocietyLedgerEntry`,
analogous to `LedgerEntry`'s Deposit/Credit flow — one admin records an entry,
a second admin must approve it before it's final.
**Trigger**: a real incident where single-admin entry proves insufficient (a
mis-recorded or disputed transaction that a second sign-off would have caught).
**Why not now**: confirmed as out of scope during design — matches
`OtherCharge`'s existing precedent of single-admin, immutable-once-created
entry. The resulting audit gap (no second sign-off) is accepted as the same
category of gap `OtherCharge` already has, not a new one to solve here.
**Cost to add**: moderate — a `status` column, a review queue UI (mirroring
`PaymentProofsPage.tsx`), and a decision about what happens to the dashboard
totals for not-yet-approved entries.

## 2. Category Rename
**What**: let an admin edit a `SocietyLedgerCategory`'s name/description/
direction after creation, not just toggle `isActive`.
**Trigger**: a real mis-named category that deactivate-and-recreate feels
insufficient for.
**Why not now**: `updateFinanceCategory` is deliberately `isActive`-only —
matches `FeeType`'s own unresolved rename question in
`docs/other-charges/05-future-scope.md`.
**Cost to add**: small — one more field on `updateFinanceCategorySchema`, plus
a decision about whether changing `direction` on a category with existing
entries should be allowed (it would silently make those entries' own
`direction` disagree with their category's — needs its own design pass).

## 3. Admin-Configurable Opening Balance
**What**: a `Society`-level opening balance figure, so the dashboard's "Net"
card becomes a true running bank balance instead of "recorded since tracking
began."
**Trigger**: real usage accumulates and an admin wants the figure to actually
mean "what's in the bank," not just "net of what's been recorded here."
**Why not now**: no opening balance was ever asked for in v1 — adding one
without real demand risks it being wrong (an unconfigured/default value would
be actively misleading, worse than the current, honestly-labeled figure).
**Cost to add**: small — one new `Society` column, one admin Settings field,
one line added to `societyNetPosition`'s calculation.

## 4. CSV Export
**What**: an admin-facing export of `SocietyLedgerEntry` history, formatted for
handing directly to an external accountant/auditor.
**Trigger**: a real audit engagement where the on-screen table proves
insufficient and a file handoff is genuinely needed.
**Why not now**: not requested for v1; the on-screen history table already
covers day-to-day review.
**Cost to add**: small — a CSV-serialization endpoint over data
`listSocietyLedgerEntries` already queries.

## 5. Recurring/Scheduled Expenses
**What**: a way to define a recurring transaction (e.g. a monthly salary or
AMC) that generates itself automatically instead of needing manual re-entry
every month.
**Trigger**: a real, demonstrated pattern of an admin re-entering the
identical transaction every month.
**Why not now**: this app currently has no scheduling primitive for
*generating* financial rows — `node-cron` (`docs/notification/`) is only ever
used for delivery, never for creating a charge/transaction automatically. This
would be new infrastructure, not a small addition.
**Cost to add**: large — a new recurrence-definition model, a cron job, and a
decision about idempotency (never duplicate a month's entry), mirroring the
care `MaintenanceRecord`'s own generation job already takes.

## Guiding Rule for All of the Above
Don't build any item in this document until the specific trigger listed next
to it has actually happened. If a trigger does occur, re-confirm the exact
shape with the user before implementing — item 1 in particular interacts with
a core design decision (single-admin, immutable entry) made deliberately for
this feature's v1, and shouldn't be assumed to still hold its original shape
without a fresh check.
