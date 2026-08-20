# Manage Finance — Roadmap

Principle: build bottom-up — schema first, since nothing downstream compiles
without it, then the backend modules, then the dashboard integration that reads
from them, then the frontend that calls both. This is a simple, single-track
dependency chain — no cross-pool balance integration to sequence around, unlike
`docs/other-charges/`.

## Suggested Build Order

```
1. Schema (Epic 1)
   SocietyLedgerDirection/SocietyLedgerPaymentMethod enums,
   SocietyLedgerCategory/SocietyLedgerEntry models, migration
   ── nothing downstream compiles without this

2. Backend — Finance Categories & Society Ledger (Epic 2)
   The catalog + the one write path (recordSocietyLedgerEntry) that creates
   SocietyLedgerEntry rows
   ── needed before any total can be non-zero, so Epic 3's queries have real data

3. Backend — Dashboard Integration (Epic 3)
   getSocietyLedgerTotals wired into getDashboardSummary
   ── the shared layer the frontend cards read from; must land before Epic 4

4. Frontend — Admin (Epic 4)
   FinanceCategoriesPage, ManageFinancePage, dashboard cards, nav/routes
   ── depends on Epics 2 and 3 being live

5. Tests (Epic 5)
   Written alongside each epic above in practice — listed last here only
   because it's the final gate before calling this done
```

No pre-launch external-dependency blocker (unlike Other Charges' WhatsApp
template approval) — this feature has no third-party integration at all.

## Explicit Non-Goals of This Roadmap
- Do not build a two-person approval workflow "while we're in the area" — it's
  explicitly deferred, see `05-future-scope.md`.
- Do not build category rename just because `FeeType` also lacks it — not
  requested, no confirmed trigger.
- Do not add real bank-statement matching/verification against
  `bankReference` — this feature only captures a self-reported value, it does
  not verify it against actual bank records.
- Do not touch or rename the existing `LedgerEntry` model for symmetry with
  `SocietyLedgerEntry`'s name — confirmed explicitly during design, the two
  coexist under different names reflecting their different scope.
