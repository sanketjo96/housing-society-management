# Notification Feature — Claude Instructions

## Objective

Implement the Notification feature described in:

- `requirements.md`
- `architecture.md`

Use those files as the source of truth.

## Before Coding

Inspect the existing repository first.

Identify and reuse:

- Existing Redis configuration.
- Existing BullMQ usage, if any.
- HTTP client conventions.
- Configuration/environment conventions.
- Dependency injection/service conventions.
- Prisma/database conventions.
- User/member model and phone-number source.
- Logging and error-handling conventions.
- Existing application startup and worker process conventions.
- Existing `src/jobs/` cron-job conventions.

Do not assume new infrastructure is required until the repository has been inspected.

## Implementation Rules

1. Follow the existing project style.
2. Add the feature under `src/features/notifications/`.
3. Keep existing cron jobs under `src/jobs/`.
4. Do not create a microservice.
5. Do not refactor unrelated features.
6. Do not add Email in Phase 1.
7. Do not add quarterly reminders.
8. Do not add notification preferences or UI.
9. Do not expose BullMQ details to Billing or Maintenance.
10. Do not call Meta directly from business features.
11. Keep Meta API details inside `whatsapp.client.ts`.
12. Keep the worker thin.
13. Use typed event payloads.
14. Never hard-code credentials.
15. Never put credentials or phone numbers into business event payloads unless the existing architecture explicitly requires it.

## Idempotency Rules

Idempotency must be enforced by a database unique constraint.

The service must:

1. Generate the deterministic idempotency key.
2. Create the notification record.
3. If the unique key already exists, treat the notification as already claimed and do not enqueue another job.
4. If the record is newly created, enqueue its `notificationId`.
5. Make queue failure recoverable.

Do not implement idempotency using only an in-memory check or only a BullMQ job ID.

## Queue Rules

Queue jobs should contain the persisted `notificationId`.

The worker should load the notification record and process it.

Do not duplicate the full business event into the queue when the persisted notification record can be used as the source of truth.

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

Resolve the user's current WhatsApp number from `recipient.userId` when processing the notification.

## Implementation Sequence

Implement one vertical slice first:

```text
MAINTENANCE_BILL_GENERATED
→ NotificationService
→ DB notification record
→ BullMQ
→ Worker
→ Dispatcher
→ WhatsApp Service
→ WhatsApp Client
→ Meta
```

Verify it end-to-end.

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
- Worker retries transient failures.
- Business API responses do not wait for WhatsApp delivery.
- WhatsApp failure does not fail the original business operation.
- Credentials are not exposed in logs or source.
