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

## Resident view — `GET /api/me/maintenance-records`

Task 4.5. `OWNER`/`TENANT` only (`403` for `ADMIN` — an admin isn't billed). Returns
every record where `payerId === req.user.id`, newest period first, each with a `flat`
summary (`id`/`wing`/`flatNumber`). This *is* "the resident's primary
outstanding-balance view" (`CLAUDE.md`'s pivot note) — the frontend filters
`status === 'UNPAID'` and sums `amount` client-side rather than the endpoint
pre-computing a total, since the full list is needed anyway for Task 6.x's "select any
combination of unpaid records to pay."

## Admin view — `GET /api/admin/maintenance-records`

Task 4.6 (absorbed the dissolved Task 5.5's dues-summary concern — see `CLAUDE.md`'s
pivot note). Every record in the society, each with `flat` and `payer` summaries.
**Optional query filters**: `status` (`UNPAID`/`PENDING_REVIEW`/`PAID`), `period`
(`YYYY-MM`), `flatId`. `400` for an invalid `status` value. No pagination — a 24-flat
MVP generates at most 24 records/month, correctness over scale (`CLAUDE.md`).

## Admin settings — `GET`/`PATCH /api/admin/settings`

Added 2026-08-06. Admin-only. Exposes `Society.tenantRateFactor` and
`Society.defaultBaseRate` (`src/services/society-settings.service.ts`). **Response
shape**: `{ tenantRateFactor: number, defaultBaseRate: number }`. `PATCH` accepts
either or both fields (partial update — omitted fields are left untouched);
`tenantRateFactor` must be a positive number `<= 9.99` (matching the column's
`@db.Decimal(3,2)` headroom), `defaultBaseRate` must be a positive number. `400` on
validation failure.

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

## Frontend — `client/src/pages/MaintenancePage.tsx`

Task 4.7. A new "Passbook" tab on `/dashboard` (`OWNER`/`TENANT` only, alongside "My
details" — see `docs/onboarding.md`'s tab table), named to match the shared
resident-view UI mockup's terminology. Shows the outstanding total (sum of `UNPAID`
amounts) and every record with a status badge. **Read-only** — no payment action yet;
that's Phase 6 ("select any combination of unpaid records, pay via QR"). The page says
so explicitly rather than silently omitting the capability.

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

curl http://localhost/api/me/maintenance-records -H "Authorization: Bearer <aliceToken>"
# → 200, exactly Alice's own A-101 record for that period
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
runs — arrears billing, above), for every seeded flat. Every period except the most
recent is then marked `PAID` directly via one `updateMany` — this is synthetic demo
history, not a real payment audit trail, so there's no proof-upload/review flow to go
through — leaving exactly one `UNPAID` period per flat as "the current due," so the
Passbook/admin views show a believable mix rather than a wall of identical `UNPAID`
badges. Safe to re-run: `generateMaintenanceRecords` is already idempotent per
flat+period, and re-running the `PAID` `updateMany` against already-`PAID` rows is a
no-op.

Run via `npx prisma db seed` (`docs/onboarding.md`). Verified against the real running
stack: 35 records created (5 seeded flats × 7 months, `2026-01`–`2026-07`), each
`payerType`/`amount` correctly reflecting that flat's actual seeded occupancy history —
e.g. B-202's April is billed to the owner, not tenant Ivan (an exact 15/15-day tie,
correctly resolved by the last-day-of-month tiebreak, above) even though Ivan occupied
most of the flat's tenancy elsewhere in the range.
