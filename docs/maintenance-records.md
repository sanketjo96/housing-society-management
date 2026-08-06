# Maintenance records — Phase 4

Reference for monthly generation, rate calculation, and the record endpoints. Same
route/prefix convention as `docs/auth.md`: every path below is mounted under `/api/`.

## Rate calculation — `src/lib/rate-calculation.ts`

`calculateMonthlyRate(period, baseRate, tenantRateFactor, ownerId, occupancyChanges)`
— a pure function (no Prisma/DB types), per CLAUDE.md's "Backend architecture" note on
why this split exists: it needs to be callable from both the manual-trigger endpoint
(Task 4.3) and the monthly cron (Task 4.4), and unit-testable without a database
(`tests/lib/rate-calculation.test.ts`).

**Confirmed decision (majority-of-days, last-day tiebreak)**: sums days under each
occupancy status across the calendar month; whichever status covered more days sets
the rate for the *entire* month. On an exact tie, the status active on the last day of
the month wins.

**Generalized beyond the original owner-vs-tenant framing**: the confirmed decision's
worked example only covers an owner→tenant transition. This function generalizes the
same rule to "whichever specific party (the owner, or any one tenant) occupied the
most days" — so a tenant-to-tenant turnover mid-month (Tenant A moves out, Tenant B
moves in the same month) is billed to whichever tenant had the majority of days, using
the identical tiebreak logic, rather than needing a special case. This wasn't
explicitly specified anywhere; it's the most direct extension of the confirmed rule
that avoids inventing a new one.

**Amount rounding**: `baseRate * tenantRateFactor`, rounded to 2 decimal places
(`Math.round(x * 100) / 100`) to match `MaintenanceRecord.amount`'s
`@db.Decimal(10, 2)` column — some factor/rate combinations produce more than 2
decimal places before rounding (e.g. `1000.33 × 1.33 = 1330.4389`).

## Monthly generation — `src/services/maintenance-record.service.ts`

`generateMaintenanceRecords(societyId, period?)` — `period` defaults to **the previous
calendar month** (`previousPeriod()`, `'YYYY-MM'`) if omitted, i.e. arrears billing. For
every flat in the society: fetches `OccupancyChange` rows that could overlap the target
month (one query for all flats, not N+1), calls the pure rate calculator per flat, and
bulk-inserts with `createMany({ skipDuplicates: true })`.

**Arrears billing, not forward billing (revised 2026-08-06)**: generation targets the
month that just *ended*, not the one just starting. `calculateMonthlyRate`'s
majority-of-days rule can only be correct once every day of the month has actually
happened — if generation ran at the *start* of a month, a tenant assigned or removed
partway through would never be reflected, because generation never re-runs for a period
once records exist (idempotency, above). Example: cron runs Sept 1 and generates for
`period: '2026-08'` — by then, any tenant assigned or removed at any point during
August is already in the DB, so the majority-of-days calculation sees August's complete
occupancy history. `currentPeriod()` still exists (e.g. for a UI wanting to preview the
in-progress month) but is no longer what generation defaults to — use `previousPeriod()`
for that.

**Idempotent by construction, not just convention** (Task 4.2's explicit requirement):
`@@unique([flatId, period])` plus `skipDuplicates` means a re-run — whether a genuine
retry, the admin manually re-triggering, or the cron and a manual trigger racing —
can never produce a duplicate record, enforced at the database level.

**`dueDate` = generation time + 15 days** (confirmed decision, `CLAUDE.md`), computed
once per generation run and applied to every record created in that run. Under arrears
billing this now reads as "pay for last month within 15 days of it ending" (e.g.
generated Sept 1 for August → due Sept 16), not "pay for this month while it's still
happening" as it did under the old forward-billing default.

## Manual trigger — `POST /api/admin/maintenance-records/generate`

Task 4.3. Admin-only. **Request body**: `{ "period": "YYYY-MM", optional — defaults to
the previous calendar month (arrears billing, see above)" }`. **Response**: `200` with
`{ created: number, skipped: number, period: string }`. `400` if `period` is present
but malformed. An explicit `period` can still target any month (e.g. backfilling a
missed run, or generating the in-progress month early if ever genuinely needed).

## Monthly cron — `src/server.ts`

Task 4.4, via `node-cron`. Runs `runMonthlyMaintenanceGeneration()`
(`src/jobs/monthly-maintenance-generation.job.ts`) at **00:05 on the 1st of every
month, `Asia/Kolkata` explicitly** (not the host's local time — this app's currency,
phone formats, and every seeded example are India-specific; "the 1st of the month"
needs to mean the same wall-clock moment regardless of which timezone the VPS host
happens to run in). 5 minutes past midnight, not exactly on it, to sidestep any
timezone-rollover edge case at the boundary.

The job iterates every `Society` (this MVP only ever has one — `CLAUDE.md`'s scope
note — but the loop costs nothing and is what "onboard a second society without a
schema rewrite" actually requires in practice) and generates for the **previous**
period (arrears billing, above) — the cron passes no explicit period, so each society
gets `generateMaintenanceRecords`'s `previousPeriod()` default. One society's failure
is logged and doesn't stop the others.

**If the server is down at 00:05** (VPS restart, deploy, etc.), that month's automatic
generation is simply missed — there's no catch-up/backfill logic. Task 4.3's manual
endpoint exists precisely to cover this: an admin can trigger generation for the
missed period by hand, any time after the fact, and it's exactly as idempotent as the
cron's own run would have been.

## Resident view — superseded by `GET /api/me/ledger`

> **Pivot note (2026-08-06)**: Task 4.5's `GET /api/me/maintenance-records` (below, for
> history) is **replaced** by `GET /api/me/ledger`, which merges these same records
> (rendered as always-"Approved" SYSTEM rows) with the flat's `LedgerEntry` rows and
> returns the three running balances — see `docs/payments.md` and `CLAUDE.md`'s ledger
> pivot note. `getMaintenanceRecordsForPayer` (the underlying query, `payerId ===
> req.user.id`, newest period first) still exists as an internal building block
> `ledger.service.ts` calls; it's no longer exposed as its own top-level route.

## Admin view — `GET /api/admin/maintenance-records`

Task 4.6 (absorbed the dissolved Task 5.5's dues-summary concern — see `CLAUDE.md`'s
pivot note). Every record in the society, each with `flat` and `payer` summaries.
**Optional query filters**: `period` (`YYYY-MM`), `flatId`. No pagination — a 24-flat
MVP generates at most 24 records/month, correctness over scale (`CLAUDE.md`). **No
`status` filter any more** (2026-08-06 ledger pivot) — every record is always
"Approved"; payment state lives on `LedgerEntry`, not here.

## Admin settings — `GET`/`PATCH /api/admin/settings`

Added 2026-08-06. Admin-only. Exposes `Society.name`, `Society.upiVpa`,
`Society.tenantRateFactor`, and `Society.defaultBaseRate`
(`src/services/society-settings.service.ts`). **Response shape**: `{ name: string,
upiVpa: string, tenantRateFactor: number, defaultBaseRate: number }`. `PATCH` accepts
any subset of the four fields (partial update — omitted fields are left untouched);
`name`/`upiVpa` must be non-empty strings, `tenantRateFactor` must be a positive
number `<= 9.99` (matching the column's `@db.Decimal(3,2)` headroom), `defaultBaseRate`
must be a positive number. `400` on validation failure.

**`name`/`upiVpa` were added alongside the original pair** — an admin needs to correct
the society's display name or rotate the UPI collection address (e.g. a new bank
account) without a support request or DB migration. `upiVpa` is read fresh from the
`Society` row by every QR generation (`lib/upi.ts`'s `buildUpiDeepLink`, called from
`ledger.service.ts`), same "no caching" guarantee as `tenantRateFactor` — a change
takes effect on the very next QR a resident generates.

**`tenantRateFactor` changes take effect on the very next generation run** —
`generateMaintenanceRecords` re-fetches the `Society` row fresh every time
(`prisma.society.findUniqueOrThrow`), never caches it — but never retroactively
changes an already-generated record's `amount`, same idempotency guarantee as
everything else in this doc. `defaultBaseRate` only affects the admin flat-onboarding
form's initial value (`client/src/pages/admin/FlatsListPage.tsx`'s `FlatForm`); it has
no effect on any existing flat's `baseRate` or on any calculation.

## Frontend settings tab — `client/src/pages/admin/SettingsPage.tsx`

A new "Settings" tab on `/dashboard`, admin-only, alongside "Flats and residents". One
form, two fields ("Default base rate", "Tenant occupancy factor"), save button disabled
until the form is dirty. `FlatsListPage`'s "Onboard a flat" form fetches the same
`['society-settings']` query (one shared cache entry) to pre-fill a new flat's base
rate — applied via a `useEffect` rather than `useForm`'s `defaultValues`, since the
settings fetch can resolve after the form has already mounted and `defaultValues` are
only read once, at mount.

## Frontend — superseded by `client/src/pages/PassbookPage.tsx`

Task 4.7 originally built `MaintenancePage.tsx` as a read-only "Passbook" tab (sum of
`UNPAID` amounts + a status badge per record, no payment action yet — that came in
Phase 6). The 2026-08-06 ledger pivot replaced it with `PassbookPage.tsx` — three
summary cards (Outstanding/Credit balance/Payable), Pay and Add credit actions, and the
full merged ledger table. See `docs/payments.md` for the current page.

## Manually verified against the real running stack

```sh
curl -X POST http://localhost/api/admin/maintenance-records/generate \
  -H "Content-Type: application/json" -H "Authorization: Bearer <adminToken>" \
  -d '{"period":"2099-02"}'
# → 200, created: 5 (one per seeded flat)

# same request again → created: 0, skipped: 5 (idempotent)

curl "http://localhost/api/admin/maintenance-records?period=2099-02" \
  -H "Authorization: Bearer <adminToken>"
# → 200, all 5 records with flat + payer summaries, correct payerType/amount per flat's
#   actual occupancy (e.g. A-103/B-201's tenants billed at 1.5x, not the owner)

curl http://localhost/api/me/ledger -H "Authorization: Bearer <aliceToken>"
# → 200, Alice's merged ledger — her A-101 record appears as a SYSTEM row for that
#   period, plus totals reflecting it in totalCharges/outstanding/payable
```

A distinctive future period (`2099-02`) was used specifically so this check's records
could be unambiguously identified and deleted afterward — the seeded demo data is also
under real interactive use (Tasks 3.7/3.8's self-service features), not just automated
tests, so verification here is deliberately non-destructive and cleans up after itself.

## Seed backfill — `prisma/seed.ts`

Added 2026-08-06 so the demo stack shows real, role-appropriate data instead of an
empty Passbook/admin dues table. `main()` calls a `backfillMaintenanceRecords()` helper
**unconditionally** — unlike the rest of `seed.ts`, which no-ops entirely once
"Sunrise Residency" already exists, this step always runs, because it needs to layer
onto an already-existing, already-in-use society, not just a fresh one.

Generates one `generateMaintenanceRecords` call per period from `2026-01` through
`previousPeriod()` (whatever "last completed month" resolves to at the moment the seed
runs — arrears billing, above), for every seeded flat. **Updated for the 2026-08-06
ledger pivot**: since `MaintenanceRecord` no longer has a `status` to flip, "settling"
the historical periods now means creating one synthetic `APPROVED` `LedgerEntry{type:
DEPOSIT}` per flat, covering the sum of its historical (all-but-the-most-recent)
charges — not a real payment audit trail, so there's no QR/proof-upload flow to go
through — leaving exactly the most recent period's charge uncovered as "the current
due" (`Payable > 0`), so the Passbook/admin views show a believable mix rather than
everything outstanding. Safe to re-run: `generateMaintenanceRecords` is already
idempotent per flat+period, and the backfill skips a flat that already has any
`DEPOSIT` `LedgerEntry`.

Run via `npx prisma db seed` (`docs/onboarding.md`). Verified against the real running
stack: 35 records created (5 seeded flats × 7 months, `2026-01`–`2026-07`), each
`payerType`/`amount` correctly reflecting that flat's actual seeded occupancy history —
e.g. B-202's April is billed to the owner, not tenant Ivan (an exact 15/15-day tie,
correctly resolved by the last-day-of-month tiebreak, above) even though Ivan occupied
most of the flat's tenancy elsewhere in the range.
