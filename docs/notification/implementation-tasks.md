# Notification Feature — Implementation Tasks (Phase 1: simplified, no Redis/BullMQ)

> See `architecture.md`'s 2026-08-18 revision note for why: this repo has no
> Redis/BullMQ today, and the realistic event volume (~25–40/month) doesn't need
> a broker + worker process. The queue-based version is deferred, fully designed,
> to `future-scope.md` — do not build it now.

Implement in the following order. Do not move to the next task until the previous task is working.

## Task 1 — Inspect Existing Infrastructure

- [x] Inspect project structure and existing feature conventions. — feature-based,
      `route/controller/service` split (CLAUDE.md's "Backend architecture" section).
- [x] Inspect Redis configuration. — **none exists.** Do not add it for Phase 1.
- [x] Check whether BullMQ already exists. — **it does not.** Do not add it for Phase 1.
- [x] Inspect existing HTTP client. — no shared HTTP client wrapper; providers call
      `fetch` directly (see `src/infrastructure/email/resend-email-provider.ts`).
      Mirror that for `whatsapp.client.ts`.
- [x] Inspect Prisma/database conventions. — services import only enums from
      `infrastructure/prisma/generated/client`, never full model types
      (`src/lib/prisma-errors.ts`'s comment). P2002 detection goes through
      `getUniqueConstraintFields()` (`src/shared/errors/prisma-errors.ts`) — reuse
      it, do not write a second duplicate-key check.
- [x] Identify the user/member field containing the WhatsApp number. — `User.phone`.
      Confirmed free text at the schema/Zod level (no format enforced anywhere in the
      app today) — most likely a bare 10-digit number, sometimes with a leading 0 or
      manual-entry separators. `whatsapp.service.ts`'s `normalizePhoneToE164()`
      normalizes defensively at delivery time and treats anything unparseable as a
      permanent failure (not worth retrying).
- [x] Inspect application startup and how background processes are run. —
      `server.ts` registers `node-cron` jobs directly at startup (see
      `cron.schedule('5 0 1 * *', ...)` for the existing monthly-maintenance job).
      No separate worker process/entry point exists or is needed here.

**Deliverable:** implementation approach aligned with the existing codebase — done,
see `architecture.md`.

## Task 2 — Create Notification Module

Create:

```text
server/src/features/notifications/
├── notification.service.ts
├── notification.types.ts
└── whatsapp/
    ├── whatsapp.config.ts
    ├── whatsapp.client.ts
    ├── whatsapp.service.ts
    ├── whatsapp.types.ts
    └── templates/

server/src/jobs/
└── notification-delivery.job.ts
```

No `queue/`, `worker/`, or `notification.dispatcher.ts` — see `architecture.md`
§3 for why. Add only the files required by the architecture.

## Task 3 — Notification Persistence

**Extend the existing `NotificationLog` model** (`prisma/schema.prisma`) — do not
create a new, parallel table. It already exists for this purpose and is
currently unused anywhere in the codebase.

Add: `idempotencyKey` (`UNIQUE`), `eventType`, `payload` (`Json`), `attemptCount`,
`providerMessageId`, `error`, `updatedAt`, `sentAt`, `nextAttemptAt`. Rename
`recipient` → `recipientUserId` (stores the userId per requirements.md's event
rules, not a phone number). Extend `NotificationChannel` with `WHATSAPP` and
`NotificationStatus` with `PENDING`/`PROCESSING`. Exact shape: `architecture.md`
§5.

Write the migration using this project's existing Prisma migration conventions
(`prisma/migrations/`, named `<timestamp>_<description>`).

## Task 4 — Notification Service

Implement the public service API:

```text
notify(event)
→ generate idempotency key
→ INSERT NotificationLog (idempotencyKey UNIQUE)
→ P2002 (via getUniqueConstraintFields) → stop, already claimed
→ inserted → row sits PENDING, picked up by the next cron sweep
```

```text
deliverPending()
→ atomically claim eligible rows (status IN (PENDING, FAILED), nextAttemptAt
  passed, attemptCount < max) → PROCESSING
→ for each: WhatsApp service → SENT (+ providerMessageId) or FAILED
  (+ error, attemptCount++, nextAttemptAt = backoff(attemptCount))
→ one row's failure doesn't stop the batch
```

Do not expose `NotificationLog`, cron, or WhatsApp types to business features —
they only ever call `notify()`.

## Task 5 — Delivery Job

Implement `server/src/jobs/notification-delivery.job.ts`, same shape as
`monthly-maintenance-generation.job.ts`:

- [x] Export a thin `deliverPendingNotifications()` that calls
      `NotificationService.deliverPending()` and logs a one-line summary
      (count sent/failed), same pattern as the existing job's per-society log line.
- [x] Register it in `server.ts` via `cron.schedule(...)` — every 1 minute is a
      reasonable starting interval at this event volume; adjust once real
      latency expectations are known.
- [x] No provider logic in this file — it only calls into
      `notification.service.ts`.

## Task 6 — WhatsApp Integration

Implement:

```text
whatsapp/whatsapp.config.ts
whatsapp/whatsapp.client.ts
whatsapp/whatsapp.service.ts
```

Requirements:

- [x] Authenticate with Meta Cloud API (`WHATSAPP_ACCESS_TOKEN`).
- [x] Resolve recipient WhatsApp number from `recipientUserId`, normalized to
      E.164.
- [x] Send a WhatsApp template.
- [x] Capture provider message ID.
- [x] Normalize provider errors — distinguish transient (retry-eligible) from
      permanent (template/number rejected — mark `FAILED` immediately, don't
      retry). `whatsapp.client.ts`: 429/5xx → `WhatsAppTransientError`, everything
      else (400/401/403/404/410 — bad template, unapproved template, rejected
      number, bad credentials) → `WhatsAppPermanentError`.
- [x] Never expose credentials in logs. Verified by test
      (`whatsapp.client.test.ts`'s "never logs the access token").

## Task 7 — First Event

Implement:

```text
MAINTENANCE_BILL_GENERATED
```

Use:

```text
maintenance_bill_generated
```

WhatsApp template. **Confirm this template has actually been approved by Meta
before running this task against production** — see `requirements.md` §5.

Test the complete path:

```text
Bill generated
→ NotificationService.notify()
→ NotificationLog row (PENDING)
→ notification-delivery.job.ts (cron sweep)
→ NotificationService.deliverPending()
→ WhatsApp Service → WhatsApp Client
→ Meta
→ Test recipient
```

**Implemented and wired end-to-end** (`generateMaintenanceRecords` →
`notify()` → `NotificationLog` → cron sweep → `deliverPending()` → WhatsApp
service/client), verified against the real path with a mocked WhatsApp client
(`notification.service.test.ts`, `maintenance-record.service.test.ts`).
**Not verified**: actual Meta template approval — that's an external,
account-specific step this environment has no way to perform (see
`requirements.md` §5's "start these before Task 8, not during it"). Until the
`maintenance_bill_generated` template is approved and `WHATSAPP_ACCESS_TOKEN`/
`WHATSAPP_PHONE_NUMBER_ID` are set, the delivery sweep will mark queued
notifications `FAILED` with that exact error, not send anything — this does
not block the rest of the app.

## Task 8 — Remaining Events

Implement:

```text
DEPOSIT_PAYMENT_APPROVED
CREDIT_PAYMENT_APPROVED
```

Use their corresponding WhatsApp templates (confirm both are Meta-approved
first, same as Task 7).

**Implemented**: `approveLedgerEntry` and `manualDeposit`
(`admin-ledger-service.ts`) both call `notify()` once their transaction
commits (deposit vs. credit determined by `LedgerEntry.type`) — `manualDeposit`
included even though the written spec only names the Approve-button flow,
since it produces the same business fact (an approved deposit + issued
receipt). Meta approval of `deposit_payment_approved`/`credit_payment_approved`
is the same unverified external dependency noted in Task 7.

## Task 9 — Idempotency and Failure Tests

Verify:

- [x] Same event twice creates one `NotificationLog` row (second `notify()`
      call hits the unique constraint and returns without inserting). —
      `notification.service.test.ts`.
- [x] A duplicate business event never results in two WhatsApp sends. — same
      test: the second `notify()` call never reaches `deliverPending()`/the
      WhatsApp service at all (`sendWhatsAppForNotification` never invoked for
      the row that already exists).
- [x] `deliverPending()` retries a transient WhatsApp failure on the next sweep
      once `nextAttemptAt` passes. — `notification.service.test.ts`.
- [x] A permanent failure reaches `FAILED` without further retries. —
      `notification.service.test.ts`; `attemptCount` jumps straight to
      `MAX_ATTEMPTS` so the claim query's `attemptCount < max` filter excludes
      it going forward.
- [x] A crash between claiming a row (`PROCESSING`) and finishing it doesn't
      silently lose the row — it's still a real, inspectable table row (see
      `architecture.md` §5's note on this being acceptable at this app's scale).
      Not covered by an automated test (would require killing the process
      mid-sweep) — verified by inspection: the row is only ever written back to
      `SENT`/`FAILED` after the WhatsApp call settles, so a crash leaves it
      sitting at `PROCESSING`, visible in the table, not deleted.
- [x] A successful notification becomes `SENT`. — `notification.service.test.ts`.
- [x] `providerMessageId` is stored when available. — same test.

## Task 10 — Integration with Business Features

Connect the existing business flows:

```text
Maintenance generation
→ MAINTENANCE_BILL_GENERATED

Deposit payment approval
→ DEPOSIT_PAYMENT_APPROVED

Credit payment approval
→ CREDIT_PAYMENT_APPROVED
```

Business code should call `NotificationService.notify()` only — never
`NotificationLog`, `node-cron`, or WhatsApp code directly.

**Implemented**:
- `generateMaintenanceRecords` (`maintenance-record.service.ts`) calls `notify()`
  once per `MaintenanceRecord` for the period after generation + the audit log
  entry are committed. `createMany` doesn't return the created rows, so this
  re-reads every record for the period/flat set and calls `notify()` for each —
  idempotency-key dedup makes re-notifying an already-existing record (an
  already-generated period, re-run) a harmless no-op.
- `approveLedgerEntry`/`manualDeposit` (`admin-ledger-service.ts`) call
  `notify()` after their transaction commits, using the just-created `Receipt`
  row's id as `receiptId`.
- All three call sites wrap `notify()` in a try/catch that only logs on failure
  — a stray notification error can never fail maintenance generation or a
  payment approval (requirements.md §4).

## Task 11 — Final Verification

Run the existing test suite and relevant application checks.

Verify that:

- [x] Existing Billing/Maintenance/Ledger behavior is unchanged. — full existing
      test suite passes (`npm test`), no assertions changed in any pre-existing
      test file.
- [x] Notifications run asynchronously — the triggering request/job never waits
      on WhatsApp delivery. — `notify()` only ever performs one `INSERT`;
      delivery happens later, off that call's critical path, on the next
      `deliverPendingNotifications()` cron tick (every minute).
- [x] No Redis or BullMQ dependency was added. — nothing added to
      `package.json` or `docker-compose.yml` beyond the three `WHATSAPP_*` env
      vars.
- [x] No unrelated refactoring was introduced.
- [x] No credentials are committed. — `WHATSAPP_ACCESS_TOKEN` etc. are read
      from the environment only (`whatsapp.config.ts`), left blank in
      `.env.example`/`docker-compose.yml`; never logged
      (`whatsapp.client.test.ts`).
- [x] All three events work end-to-end, against a mocked WhatsApp client/service
      (real Meta send is blocked on template approval — see Tasks 7/8's notes).
      Migration `20260818170000_extend_notification_log_whatsapp` applied to
      the running dev DB; backend container rebuilt and redeployed.
