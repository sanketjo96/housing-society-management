# 0003 — Credit: added, removed, re-added, removed for good

**Status**: Accepted — Credit does not exist. `LedgerEntry` has no `type`
column; every row is a Deposit.

## Context

Credit was a resident-requested, committee-approved balance adjustment,
separate from a UPI Deposit (e.g. a repair cost settled against maintenance).
It went through three full removals and one reintroduction before landing on
its current, permanent shape. Recorded here as one decision, not four,
because the end state is what matters — the churn itself isn't.

## Timeline (condensed)

1. **Introduced** alongside the balance-based ledger (0002) — a separate
   `LedgerType` (`DEPOSIT`/`CREDIT`), a separate "Credit balance" netted
   against Outstanding.
2. **Removed** — decided the society would never use it; simpler to have
   only Deposits.
3. **Reintroduced**, same day, in a different shape — a committee-approved
   discretionary adjustment (amount + required reason + required proof), no
   upper-bound validation (only `amount > 0`, unlike a Deposit's cap at
   Outstanding). Money pooled fungibly with Deposits into one balance
   calculation rather than netted separately.
4. **Removed for good** — once a Deposit's amount cap against Outstanding was
   lifted (any amount `> 0`, not just up to Outstanding), overpayment already
   produces `Available Credit` for free, through the exact same balance
   formula. Nothing Credit did was still needed.

## Decision

No Credit concept. A resident's only way to affect their balance is a
Deposit. Overpaying a Deposit produces `Available Credit` automatically:

```
approvedFunds     = approvedDeposits
Outstanding       = max(0, totalCharges - approvedFunds)
Available Credit  = max(0, approvedFunds - totalCharges)
```

## Consequences

- `LedgerEntry.type`/`LedgerType` gone. No `POST /api/me/ledger/credits`.
- The per-record settlement FIFO fill (`computeRecordSettlements`) needed
  zero code changes across this whole saga — money is fungible once summed,
  regardless of which endpoint it arrived through. See
  `docs/features/maintenance-records.md`.
- `Available Credit` as a concept is untouched throughout — only its source
  changed (pure Deposit overpayment now, never a separate request).
