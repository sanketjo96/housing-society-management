# Notification Feature — Implementation Tasks

Implement in the following order. Do not move to the next task until the previous task is working.

## Task 1 — Inspect Existing Infrastructure

- [ ] Inspect project structure and existing feature conventions.
- [ ] Inspect Redis configuration.
- [ ] Check whether BullMQ already exists.
- [ ] Inspect existing HTTP client.
- [ ] Inspect Prisma/database conventions.
- [ ] Identify the user/member field containing the WhatsApp number.
- [ ] Inspect application startup and how background processes are run.

**Deliverable:** implementation approach aligned with the existing codebase.

## Task 2 — Create Notification Module

Create:

```text
src/features/notifications/
├── notification.service.ts
├── notification.dispatcher.ts
├── notification.types.ts
├── queue/
├── worker/
└── whatsapp/
```

Add only the files required by the architecture.

## Task 3 — Notification Persistence

Create the notification persistence model/table using existing Prisma conventions.

Minimum data:

```text
notificationId
idempotencyKey UNIQUE
eventType
recipientId
channel
status
providerMessageId
attemptCount
error
createdAt
updatedAt
sentAt
```

Add the unique database constraint on `idempotencyKey`.

## Task 4 — Notification Service

Implement the public service API.

Responsibilities:

```text
receive event
→ generate idempotency key
→ create notification record
→ duplicate → stop
→ new record → enqueue notificationId
```

Do not expose BullMQ to business features.

## Task 5 — BullMQ Queue

Implement the notification queue.

Requirements:

- [ ] Use existing Redis configuration.
- [ ] Create a dedicated notification queue.
- [ ] Queue `notificationId`.
- [ ] Configure retry/backoff.
- [ ] Make queue insertion failure recoverable.

## Task 6 — Worker

Implement the notification worker.

Flow:

```text
job
→ load notification
→ mark PROCESSING
→ dispatcher
→ success: mark SENT
→ failure: record error and allow retry
```

Keep provider logic out of the worker.

## Task 7 — WhatsApp Integration

Implement:

```text
whatsapp.config.ts
whatsapp.client.ts
whatsapp.service.ts
```

Requirements:

- [ ] Authenticate with Meta Cloud API.
- [ ] Resolve recipient WhatsApp number from `userId`.
- [ ] Send a WhatsApp template.
- [ ] Capture provider message ID.
- [ ] Normalize provider errors.
- [ ] Never expose credentials in logs.

## Task 8 — First Event

Implement:

```text
MAINTENANCE_BILL_GENERATED
```

Use:

```text
maintenance_bill_generated
```

WhatsApp template.

Test the complete path:

```text
Bill generated
→ NotificationService
→ DB
→ BullMQ
→ Worker
→ WhatsApp
→ Meta
→ Test recipient
```

## Task 9 — Remaining Events

Implement:

```text
DEPOSIT_PAYMENT_APPROVED
CREDIT_PAYMENT_APPROVED
```

Use their corresponding WhatsApp templates.

## Task 10 — Idempotency and Failure Tests

Verify:

- [ ] Same event twice creates one notification.
- [ ] Duplicate event does not create a second queue job.
- [ ] Worker retry works for transient WhatsApp failure.
- [ ] Permanent failure reaches FAILED state.
- [ ] Queue failure does not leave an unrecoverable notification.
- [ ] Successful notification becomes SENT.
- [ ] Provider message ID is stored when available.

## Task 11 — Integration with Business Features

Connect the existing business flows:

```text
Maintenance
→ MAINTENANCE_BILL_GENERATED

Deposit payment approval
→ DEPOSIT_PAYMENT_APPROVED

Credit payment approval
→ CREDIT_PAYMENT_APPROVED
```

Business code should call `NotificationService`, not BullMQ or WhatsApp directly.

## Task 12 — Final Verification

Run the existing test suite and relevant application checks.

Verify that:

- [ ] Existing Billing/Maintenance behavior is unchanged.
- [ ] Notifications run asynchronously.
- [ ] No unrelated refactoring was introduced.
- [ ] No credentials are committed.
- [ ] All three events work end-to-end.
