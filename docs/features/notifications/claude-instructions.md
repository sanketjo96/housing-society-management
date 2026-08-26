# Notification Feature — Claude Instructions (Phase 1: simplified, no Redis/BullMQ)

## Objective

Implement the Notification feature described in:

- `requirements.md`
- `architecture.md`

Use those files as the source of truth. **Do not build the queue-based design
described in `future-scope.md`** — that's the documented upgrade path for later,
not this phase.

## Before Coding

Inspect the existing repository first. `implementation-tasks.md`'s Task 1 has
already answered most of this (no Redis, no BullMQ, `node-cron` for
scheduling, `NotificationLog` already exists unused, `getUniqueConstraintFields()`
is the existing P2002-detection helper) — confirm it's still accurate, don't
re-derive it from scratch.

Identify and reuse:

- The existing `node-cron` scheduling pattern (`src/jobs/`,
  `monthly-maintenance-generation.job.ts`, its registration in `server.ts`).
- HTTP client conventions (plain `fetch`, see
  `src/infrastructure/email/resend-email-provider.ts`).
- Configuration/environment conventions (`src/config/env.ts`).
- Prisma/database conventions, including `getUniqueConstraintFields()`
  (`src/shared/errors/prisma-errors.ts`) for detecting the idempotency-key
  collision.
- The existing `NotificationLog` model — extend it, don't create a parallel one.
- The `User.phone` field as the WhatsApp number source — confirm its current
  format before assuming it's already E.164.
- Logging and error-handling conventions.
- Route/controller/service split, if this feature ever needs an HTTP surface
  (it doesn't for Phase 1 — `notify()` is called in-process from other
  services, there's no notification-specific endpoint).

Do not assume new infrastructure is required until the repository has been
inspected. It has been (see `implementation-tasks.md` Task 1) — the answer for
Phase 1 is: no new infrastructure.

## Implementation Rules

1. Follow the existing project style.
2. Add the feature under `src/features/notifications/`.
3. Put the delivery cron entry point under `src/jobs/`, same as the existing
   monthly-maintenance job.
4. Do not create a microservice.
5. Do not add Redis or BullMQ, or a separate worker process, in Phase 1 — see
   `future-scope.md` for when to graduate to that.
6. Do not refactor unrelated features.
7. Do not add Email in Phase 1.
8. Do not add quarterly reminders.
9. Do not add notification preferences or UI.
10. Do not expose delivery/cron internals to Billing, Ledger, or Maintenance —
    they call `NotificationService.notify()` and nothing else.
11. Do not call Meta directly from business features.
12. Keep Meta API details inside `whatsapp.client.ts`.
13. Keep the delivery job (`notification-delivery.job.ts`) thin — no provider
    logic in it, same rule the original design had for the worker, just
    applied to a cron function instead.
14. Use typed event payloads (`notification.types.ts`).
15. Never hard-code credentials.
16. Never put credentials or phone numbers into business event payloads unless
    the existing architecture explicitly requires it — it doesn't; resolve the
    phone number at delivery time from `recipientUserId`.

## Idempotency Rules

Idempotency must be enforced by a database unique constraint on
`NotificationLog.idempotencyKey`.

The service must:

1. Generate the deterministic idempotency key
   (`<eventType>:<businessId>:<channel>`).
2. Insert the `NotificationLog` record.
3. If the unique key already exists (detected via `getUniqueConstraintFields()`,
   not a hand-rolled P2002 check), treat the notification as already claimed
   and stop — nothing further to do.
4. If the record is newly created, it's `PENDING` and will be picked up by the
   next `deliverPending()` sweep automatically — there is no separate enqueue
   step to fail.

Do not implement idempotency using only an in-memory check. There is no
BullMQ job ID in this design to (mis-)rely on either — the unique constraint on
the DB row is the only source of truth, which is simpler than the original
design, not a weaker version of it.

## Delivery Rules

There is no separate queue payload to keep in sync with the `NotificationLog`
row — the row **is** the queue. `deliverPending()` claims eligible rows
directly from the table (`status IN (PENDING, FAILED)`, `nextAttemptAt`
passed, `attemptCount < max`) and processes them in-process; there is no
worker process to hand a job to.

## WhatsApp Rules

Use the Meta WhatsApp Cloud API.

Keep:

```env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_API_VERSION=
```

in the existing configuration mechanism.

Do not log access tokens.

Resolve the user's current WhatsApp number from `recipientUserId` when
processing the notification, normalized to E.164 — confirm `User.phone`'s
actual stored format first (see `requirements.md` §5); do not assume it's
already E.164.

## Implementation Sequence

Implement one vertical slice first:

```text
MAINTENANCE_BILL_GENERATED
→ NotificationService.notify()
→ NotificationLog row (PENDING)
→ notification-delivery.job.ts (cron sweep)
→ NotificationService.deliverPending()
→ WhatsApp Service
→ WhatsApp Client
→ Meta
```

Verify it end-to-end, including that the WhatsApp template is actually
Meta-approved (an external dependency with its own lead time — don't discover
this mid-task).

Then implement:

```text
DEPOSIT_PAYMENT_APPROVED
CREDIT_PAYMENT_APPROVED
```

## Validation

Before considering the feature complete, verify:

- Bill-generated notification reaches the test WhatsApp number.
- Duplicate bill events do not send duplicate messages.
- Deposit payment notification works.
- Credit payment notification works.
- The delivery sweep retries transient failures and stops retrying permanent
  ones.
- Business API responses do not wait for WhatsApp delivery.
- WhatsApp failure does not fail the original business operation.
- Credentials are not exposed in logs or source.
- No Redis or BullMQ dependency was added to `package.json` or
  `docker-compose.yml`.
