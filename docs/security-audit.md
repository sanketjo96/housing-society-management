# Security & hardening audit (Phase 9, 2026-08-12)

Reference for the Phase 9 audit's findings and fixes. Same convention as every
other `docs/` file — this is the living record of *why*, `docs/task-status.md`
is the checklist. Five sub-tasks (9.1–9.5); this doc covers each in turn.

## 9.1 — Society-scoping audit

Every id-based Prisma query (`findUnique`/`findFirst`/`update`/`delete`/`upsert`)
across all of `server/src/services/*.ts` was reviewed for whether it verifies the
row belongs to the caller's own society — either directly (`scopedWhere`,
`lib/tenant-scope.ts`, Task 2.6) or via a relation filter (e.g.
`{ id, flat: { societyId } }`), or transitively (the id itself was produced by an
earlier scoped lookup in the same call chain, never taken directly from the
request).

**Critical finding, fixed**: `POST /api/admin/users` (`admin-users.controller.ts`)
accepted `societyId` straight from the request body and passed it through
unchecked to `createUser()`. Any authenticated ADMIN of *any* society could name
a different society's id and provision a full-privilege account there —
including `role: 'ADMIN'` — then log in as that account and reach every admin
endpoint for a society they have no relationship with. A full write-side
tenant-boundary bypass, not a read-only leak. Fixed by dropping `societyId` from
`createUserSchema` entirely and always using `req.user.societyId` server-side,
matching `flats.controller.ts`'s `createFlatHandler`, which already did this
correctly. Regression test:
`tests/routes/admin-users.tenant-scope.test.ts`'s "ignores a client-supplied
societyId" case (an admin from Society A attempts `societyId: societyB.id`, the
new user lands in Society A regardless).

**Defense-in-depth, not a live bug**: `ledger.service.ts`'s `PaymentIntent`
functions (`getOpenPaymentIntent`, `createOrReplacePaymentIntent`,
`cancelPaymentIntent`, `submitPaymentIntent`) queried `paymentIntent` by `flatId`
alone, with no societyId anywhere in the `where` clause — `PaymentIntent` has no
direct `societyId` column, only via its `Flat` relation. Every current caller
already validates `flatId` against the caller's own society first
(`ledger.controller.ts`'s `resolveMyFlatId` → `flats.service.ts`'s `getMyFlat`,
itself `scopedWhere`-protected), so this was never reachable by any existing
route — but a future caller that ever passed a client-supplied `flatId` straight
through without going via `resolveMyFlatId` first would have silently read or
mutated a different society's pending payment. Added an explicit
`flat: { societyId }` filter to all four functions so that hypothetical future
mistake fails safe (empty result / no-op) instead.

**Everything else reviewed** (62 query sites total) was already correctly
scoped — either directly, via a relation filter, or transitively through an
earlier validated lookup in the same function. Full per-file breakdown available
in the audit's working notes if needed; not reproduced here since nothing else
required a code change.

## 9.2 — Rate limiting on auth endpoints

Confirmed neither the app nor nginx (`nginx/default.conf`) had any rate limiting
anywhere. Added `src/middleware/auth-rate-limit.ts` (`express-rate-limit`):

- `loginRateLimiter` — 10 requests / 15 min per IP, on `POST /api/auth/login`.
- `passwordResetRateLimiter` — 5 requests / 15 min per IP, **shared** between
  `POST /api/auth/request-reset` and `POST /api/auth/reset` (both are part of
  the same flow — an attacker hammering either one draws down the same budget).

**Deliberately not applied to `POST /api/auth/refresh`** — it's keyed by a
32-byte random httpOnly-cookie token, not a guessable credential, and the
frontend calls it silently on every page load (`AuthContext`'s session-restore);
an aggressive limit there risks locking out real users' ordinary browsing rather
than blocking an attacker.

**`app.set('trust proxy', 1)`** (`app.ts`) was required alongside this — this
deployment always sits behind exactly one reverse proxy (nginx), which sets
`X-Forwarded-For` itself. Without trusting that one hop, `req.ip` (and therefore
the rate limiter's key) would see nginx's own container IP for every request,
meaning every real user would share one collective rate-limit bucket instead of
being limited individually.

**Disabled during the automated test suite** — `tests/setup.ts` sets
`DISABLE_RATE_LIMIT=true`, since many test files each call `POST /api/auth/login`
a few times in their own `beforeAll`, and would otherwise trip the shared `app`
instance's limits from ordinary cross-file traffic. The limiter's actual 429
behavior is verified against an isolated instance (that doesn't honor the flag)
in `tests/middleware/auth-rate-limit.test.ts`.

## 9.3 — Consistent error handling

**Critical finding, fixed, confirmed empirically**: Express 4 does not catch a
promise rejected by an async route handler — it only forwards *synchronously*
thrown errors to `next(err)`. An uncaught `throw` inside any `async` handler
therefore never reached `error-handler.ts`'s `errorHandler` middleware at all;
it became an unhandled promise rejection and **crashed the entire Node process**
(confirmed with a minimal reproduction: a bare `async` handler that throws takes
the whole server down, exit code 1, in well under a second). This affected:

- Every controller's `catch (err) { ...known cases...; throw err; }` fallback
  pattern (the "let the global handler deal with anything unexpected"
  convention used throughout `src/controllers/*.ts`) — the fallback never
  actually reached the global handler.
- `admin-dashboard.controller.ts` and `maintenance-records.controller.ts`,
  whose handlers had **zero** try/catch at all — any unexpected error there
  (a Prisma connection hiccup, an edge case in a rarely-hit branch) crashed the
  process immediately, with no error handling whatsoever.

In practice this meant a single bad request, anywhere in the app, could take
the entire backend down for every user simultaneously — the most severe finding
of this audit. Fixed with `express-async-errors`, imported at the very top of
`app.ts` (before any route is registered — it patches Express's
Router/Layer prototype, so import order matters). Verified with a regression
test (`tests/middleware/error-handler.test.ts`) proving an uncaught async throw
now returns a clean `500 { error: "Internal server error" }` (never leaking the
real message) instead of crashing the process — confirmed via `EXIT CODE: 0` on
a minimal reproduction with vs. without the fix.

## 9.4 — AuditLog verification

Cross-checked every `AuditLog.create` call against Tasks 4.2 (monthly
generation), 6.5 (approve), 6.6 (reject), 6.7 (manual mark-paid).

- **6.5/6.6/6.7 already covered** — `ledger.service.ts` writes
  `APPROVE_DEPOSIT`/`APPROVE_CREDIT`, `REJECT_DEPOSIT`/`REJECT_CREDIT`, and
  `MANUAL_MARK_PAID` rows at the right points, each with a sensible
  `actorId`/`entityId`/`note`.
- **4.2 had no audit trail at all** — fixed. `generateMaintenanceRecords`
  (`maintenance-record.service.ts`) now takes an optional `actorId` parameter
  (the admin who called the manual-trigger endpoint; `undefined` for the
  monthly cron, which has no user in context — `AuditLog.actorId` is nullable
  specifically to represent that "system-triggered" case) and writes one
  `GENERATE_MAINTENANCE_RECORDS` row per invocation, `entityType:
  'MaintenanceRecord'`, `entityId` = the period string (e.g. `'2026-07'` — the
  natural identity of a generation run, since it's idempotent per
  society+period), `note` summarizing the society name and
  created/skipped counts. Logged even for the "no flats onboarded yet"
  early-return case, so an admin can confirm the job actually ran even when it
  had nothing to do.

No other financial or administrative action was found missing an audit trail
within this task's explicit scope (4.2/6.5/6.6/6.7); broader coverage (e.g.
settings changes, tenant assignment) was out of scope for this pass.

## 9.5 — File upload validation re-check

**Finding, fixed**: `proof-upload.ts`/`signature-upload.ts`'s multer
`fileFilter` only ever checked `file.mimetype` — the client-*declared*
Content-Type on the multipart part, which any HTTP client can set to anything
regardless of the file's actual content. This matters concretely here (not just
in the abstract) because uploaded files are later served back with
`Content-Type` set to that same stored value
(`ledger.controller.ts`/`society-settings.controller.ts`'s file-viewing
handlers), and an admin routinely opens residents' uploaded "screenshots" as
part of the normal payment-proof review workflow — a spoofed upload is a real
delivery vector against the admin, not just a theoretical gap.

Fixed with a small, dependency-free magic-byte sniffer,
`src/lib/file-signature.ts`'s `detectFileType(buffer)`, checking the leading
bytes against the four formats this app actually accepts (PNG, JPEG, WEBP,
PDF). A third-party sniffing library (`file-type`) was evaluated and rejected:
its current major version is ESM-only (awkward from this CommonJS backend), and
every version compatible with this codebase carries a known moderate-severity
infinite-loop DoS in its ASF/WMV parser (`GHSA-5v7r-6r5c-r473`) — a format this
app has no reason to even recognize, and adopting a general-purpose sniffer
would have reintroduced exactly the kind of DoS surface Task 9.3 just closed.

`src/middleware/verify-file-signature.ts` runs the check *after* multer (multer's
`memoryStorage` only populates `req.file.buffer` once the whole file is read,
so this can't happen inside multer's own `fileFilter`), wired into every upload
route (`ledger.route.ts`'s three proof-upload endpoints,
`society-settings.route.ts`'s signature upload). On a match it overwrites
`req.file.mimetype` with the *verified* type — from that point on, the stored
and later-served `Content-Type` is what this app actually confirmed, not an
attacker's claim. Throws the same `"Unsupported file type"`-prefixed message
`error-handler.ts` already recognized, so no change was needed there.

Also added a global `X-Content-Type-Options: nosniff` header (`app.ts`) as
defense-in-depth, so a browser is never tempted to second-guess an explicit,
now-verified `Content-Type` by sniffing the response body itself.

## New dependencies introduced this phase

| Package | Why |
|---|---|
| `express-async-errors` | 9.3 — the process-crash fix; patches Express 4's router to forward async rejections to `next(err)` |
| `express-rate-limit` | 9.2 — auth-endpoint rate limiting |

No change to the storage/QR/PDF/email dependency set. `file-type` was evaluated
for 9.5 and deliberately **not** adopted — see that section above.
