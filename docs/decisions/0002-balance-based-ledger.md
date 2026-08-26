# 0002 — Payment against one aggregate balance, not selected records

**Status**: Accepted (supersedes 0001's record-selection model)

## Context

0001 still had a resident select specific unpaid `MaintenanceRecord`s and pay
their exact sum. This meant no partial payment against a single month, and a
`PaymentProof` model linking one proof to many selected records.

## Decision

Replace record-selection with a balance-based ledger. `MaintenanceRecord`
keeps generating exactly as before (rate calc, idempotency untouched) but
drops its paid/unpaid status — it just permanently contributes its amount to
the flat's `totalCharges`. A new `LedgerEntry` model (replacing
`PaymentProof`) records Deposits against the aggregate:

```
Outstanding = max(0, totalCharges - approvedDeposits)
```

A resident enters one amount and pays it — never selects which months it
covers.

## Consequences

- `MaintenanceRecord.status` column dropped.
- `PaymentProof`'s many-to-many "one proof covers N records" shape no longer
  applies — a Deposit isn't tied to specific records.
- Per-record paid/partial/unpaid status is still shown to residents (Maintenance
  Book) and used for escalation, but computed fresh on every read via a FIFO
  fill of approved funds across records oldest-first — never stored. See
  `docs/features/maintenance-records.md`.
- Proof upload becomes optional on a Deposit (was mandatory).
- Opened the door to explicit partial and over- payment — see 0003 for how
  overpayment is tracked.
