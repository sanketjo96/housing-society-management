# 0004 — Bill in arrears, not forward

**Status**: Accepted

## Context

Monthly maintenance generation originally defaulted to the *current* calendar
month, run at 00:05 on the 1st (bill for August on August 1st). Rate
calculation for a month sums days under each occupancy status and bills
whichever status had the majority — a rule that can only be evaluated
correctly once every day of the target month has actually happened.
Generating on Aug 1st for August can't know about a tenant change on Aug
10th, because it hasn't happened yet. Generation never re-runs for a period
once records exist, so a wrong record would be permanently wrong.

## Decision

Generate for the *previous* calendar month instead — still run at 00:05 on
the 1st, but billing the month that just ended. Guarantees the full month's
occupancy history already exists before the rate is calculated.

## Consequences

- `dueDate` is still generation time + 15 days, but its meaning shifts:
  residents now pay for last month within 15 days of it ending, not for the
  current month while still in progress.
- `currentPeriod()` stays a named export for callers that legitimately want
  the in-progress month (e.g. a preview); `previousPeriod()` is the default
  everywhere generation actually runs. See `docs/features/maintenance-records.md`.
