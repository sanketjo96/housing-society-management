# Society Onboarding — Requirements

**Status: ✅ Implemented (2026-08-21)** — all three phases (A/C/E) built as
specified below. See [`02-architecture.md`](./02-architecture.md)'s
implementation-status note for the one placement change from the original
sketch (every importer lives under one "Imports" nav submenu, including
Phase E, not inline on `ManageFinancePage.tsx`), and
[`../feature-track/status.md`](../feature-track/status.md) for the
cross-feature index entry.

## Context
- App: Society management system (currently one live society, ~24 flats, 2
  personas — Admin, Resident).
- CLAUDE.md and `docs/data-model.md` both state the schema was deliberately
  designed so "a second society could be onboarded later without a schema
  rewrite" — but nothing beyond the schema was ever built. Today `Society`
  creation happens exactly once, via a hardcoded `server/prisma/seed.ts`
  script; there is no API/UI path to create a new society, and no tooling to
  bulk-load an existing society's historical data into the app.
- Driving case: **Pukhraj**, a freemium client whose entire record-keeping
  today is an Excel workbook (read directly from their spreadsheet during
  planning). Its shape is genuinely messy in ways a "24 clean CSV rows" story
  doesn't cover — multi-year arrears bucketed by date range rather than by
  month, no owner email/phone anywhere, a "Sinking Fund" concept this app
  doesn't model, and a monthly society-expense ledger going back to 2013.
- Goal: design onboarding so it works for Pukhraj *and* generalizes to the
  next client — a repeatable runbook backed by real tooling, not a one-off
  script written for this one case.

## Problem Statement
Three separate gaps block onboarding a second society today:
1. **No way to create a `Society` + its first `ADMIN` user** other than a
   direct DB/seed-script action. `docs/auth.md`'s "Bootstrapping note"
   explicitly flags this as deliberately deferred, never built.
2. **No way to bulk-load historical financial data** — arrears, one-time
   charges, and past society expenses — once a society and its flats exist.
   The existing bulk importer (`POST /api/admin/flats/import`) only covers
   the flat/owner/tenant roster, not money.
3. **No documented process** for taking a client from "here's an Excel file"
   to "residents can log in and pay" — this genuinely doesn't exist anywhere
   in `docs/` yet (confirmed: `docs/flats.md` is titled "flat & society
   onboarding" but only ever covers *flat* onboarding).

## Confirmed Product Decisions
These were explicitly settled (not defaults) during design discussion and
should not be re-litigated without a new conversation:

1. **A real bootstrap mechanism gets built** — not a manual seed script run
   by a developer for every new society. Repeatability matters more than
   minimizing new surface area.
2. **Historical arrears become one lump "Opening Balance" charge per flat**,
   dated at go-live — never a synthetic month-by-month backfill. Matches the
   universal accounting-software pattern (QuickBooks, Xero, property-
   management SaaS): draw a line at go-live, post one opening figure, don't
   try to replay history the new system was never present for.
3. **Historical society-level expenses are also bulk-imported**, into the
   already-shipped Manage Finance ledger (`SocietyLedgerEntry`) — not just
   tracked going forward from go-live.
4. **Bulk-imported expense rows skip Manage Finance's mandatory-proof-file
   rule.** `recordSocietyLedgerEntry` normally rejects any entry with no
   file attached ("independent evidence attached every time, not
   sometimes") — Pukhraj's historical rows have no scanned receipts to
   attach retroactively. Imported rows instead carry an explicit auto-note
   flagging them as historical/unverified, so they stay visibly distinct
   from a normal admin-entered row in every list view.
5. **A "Sinking Fund" is out of scope as a tracked balance, v1.** The app
   has no concept of a society-held reserve pool today (only resident-billed
   Maintenance/Other Charges and Manage Finance's income/expense ledger
   exist) — forcing Pukhraj's ₹80,000 figure into either would misrepresent
   what the number means. It is captured as a plain-text note only.

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| R1 | A platform operator can create a new `Society` + its first `ADMIN` user in one call, without ever accepting a client-supplied `societyId` for an *existing* society | Must |
| R2 | The new admin's account is usable immediately (password-reset flow triggered, same mechanism `findOrCreateUserByEmail` already uses) | Must |
| R3 | An admin can bulk-import a flat/owner/tenant roster even when real owner email/phone isn't available, using a documented placeholder-contact convention that doesn't collide across societies sharing the platform | Must |
| R4 | An admin can bulk-import a one-time "Opening Balance" arrears charge per flat, which settles ahead of every future real month's charge (oldest-first, matching existing FIFO settlement) | Must |
| R5 | An admin can bulk-import other one-time per-flat charges (e.g. a water-connection fee) via the same tool as R4, keyed by an existing `FeeType` | Must |
| R6 | An admin can bulk-import historical society-level income/expense transactions into Manage Finance, without needing a proof file per row | Must |
| R7 | Every bulk-import path collects and reports per-row errors without aborting the whole batch (matching `bulkImportFlats`'s existing convention) | Must |
| R8 | Every bulk-import path is idempotent — re-running an import for a flat/period that already has data does not create a duplicate | Must |
| R9 | A "Sinking Fund" (or similar out-of-model figure) can be recorded as a plain informational note on the society, visible to the admin, without being billed or tracked as a balance | Should |

## Non-Functional Requirements
- **No settlement-math duplication or corruption risk**: the Opening Balance
  design must plug into `computeRecordSettlements`/`computeFlatBalances`
  (`ledger-shared.ts`) with zero changes to that code — correctness here is
  the single highest-stakes part of this whole feature, since a bug
  misstates a real resident's real debt.
- **Never trust a client-supplied `societyId`** for any endpoint that could
  reach into an *existing* society — the exact discipline already enforced
  everywhere else in this codebase since the Phase 9 security audit
  (`docs/security-audit.md` finding 9.1) must extend to every new endpoint
  this feature adds.
- **Backward compatibility**: zero change to any existing single-flat or
  single-entry code path (`createFlat`, `billOtherCharge`,
  `recordSocietyLedgerEntry`) — every bulk path is additive, reusing their
  validation, never replacing them.
- **Correctness over scale**: this app's own stated MVP philosophy applies
  here too — a hand-rolled CSV parser (matching `bulkImportFlats`'s existing
  approach) is enough; no import-library dependency, no async job queue, no
  pagination on a ~24-row import.

## Explicitly Out of Scope (v1)
- A self-serve onboarding wizard the client operates unsupervised — this is
  concierge/white-glove tooling for the SMI team to run on a client's
  behalf, matching this company's current stage (see `04-roadmap.md`).
- A real `SinkingFund` model/balance tracking.
- A "draft society" / staging-before-go-live concept in the app itself
  (mitigated by a manual spot-check step in the runbook instead, see
  `05-future-scope.md`).
- Bulk CSV import of `FeeType`/`SocietyLedgerCategory` catalog rows (fewer
  than 20 rows per society — one-at-a-time entry via existing forms is
  faster than building and validating a bulk path for this).
- A generic multi-society admin UX (society switcher, cross-society
  reporting) — unchanged from CLAUDE.md's existing MVP scope statement.
- Relaxing `bulkImportFlats`'s required-columns list to make phone/email
  genuinely optional at the schema/validation level (worked around via a
  placeholder-value convention instead, see `05-future-scope.md`).

These are tracked with their trigger conditions in
[`05-future-scope.md`](./05-future-scope.md) — revisit only if a concrete
need appears, not on a schedule.

## Success Criteria
- A platform operator can stand up a brand-new society + admin login with
  one API call, with no way for that call to ever touch an existing
  society's data.
- Pukhraj's real 24-flat roster, arrears, one-time charges, and historical
  expenses can all be loaded via CSV import, end to end, without hand-
  editing the database.
- After import, the Maintenance Book correctly shows each flat's opening
  arrears as a distinct "Opening Balance" line that settles before any
  later real month — verified by spot-checking 2-3 flats against the
  original spreadsheet.
- The admin Dashboard's Finance/Maintenance/Other Charges/Society Finance
  card groups all show numbers consistent with Pukhraj's original sheet
  after the full import runs.
- The same runbook, unmodified, is usable for the next client without
  Pukhraj-specific assumptions baked into any tool.
