# 0001 — Monthly records are independently payable, no quarterly bundling

**Status**: Accepted (supersedes original design)

## Context

Original design: `MaintenanceRecord`s were monthly/accrual-only, bundled
three at a time into a quarterly `Invoice`, which was the only payable
entity.

## Decision

Drop `Invoice` entirely. `MaintenanceRecord` is payable immediately after
generation. A resident sees a live outstanding balance across however many
unpaid months exist and pays against that balance directly.

## Consequences

- No `Invoice` model.
- No quarter to wait for — a resident can pay a single month the day it's
  generated.
- Superseded in turn by 0002 (balance-based ledger) — even
  "select which unpaid records to pay" didn't survive; see that record.
