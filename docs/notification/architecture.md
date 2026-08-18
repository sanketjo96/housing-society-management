# Notification Feature — Architecture

## 1. Placement

The existing application is feature-based.

Add:

```text
src/features/notifications/
```

Keep existing scheduled jobs under:

```text
src/jobs/
```

Do not create a separate microservice.

## 2. Runtime Flow

```text
Billing / Maintenance
        │
        │ business event
        ▼
NotificationService
        │
        ▼
Notification Queue
        │
        ▼
BullMQ / Redis
        │
        ▼
Notification Worker
        │
        ▼
Notification Dispatcher
        │
        ▼
WhatsApp Service
        │
        ▼
WhatsApp Client
        │
        ▼
Meta WhatsApp Cloud API
```

The API request ends after the notification job is safely queued. WhatsApp delivery happens in the background.

## 3. Folder Structure

```text
src/features/notifications/
├── notification.service.ts
├── notification.dispatcher.ts
├── notification.types.ts
│
├── queue/
│   ├── notification.queue.ts
│   └── notification.queue.types.ts
│
├── worker/
│   └── notification.worker.ts
│
└── whatsapp/
    ├── whatsapp.service.ts
    ├── whatsapp.client.ts
    ├── whatsapp.types.ts
    ├── whatsapp.config.ts
    └── templates/
        ├── maintenance-bill-generated.ts
        ├── deposit-payment-approved.ts
        └── credit-payment-approved.ts
```

## 4. Responsibilities

### Notification Service

Public API for business features.

It accepts notification intent and handles creation/queueing of the notification.

Business features must not know about BullMQ, Redis, or WhatsApp.

### Queue

Owns BullMQ configuration and job creation.

The queue job should contain the persisted `notificationId`, not a duplicated copy of the full business event.

### Worker

Consumes jobs and passes them to the dispatcher.

Keep the worker thin.

### Dispatcher

Routes notification events to the appropriate channel.

Phase 1 has only WhatsApp.

### WhatsApp Service

Handles notification-level WhatsApp logic:

- Resolve recipient.
- Select template.
- Build template parameters.
- Call the WhatsApp client.
- Normalize results/errors.

### WhatsApp Client

Owns Meta API HTTP details.

Only this layer should know Meta API request/response details.

## 5. Notification Persistence and Idempotency

Persist a notification record before enqueueing.

The record must have a unique `idempotencyKey`.

Suggested fields:

```text
notificationId
idempotencyKey       UNIQUE
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

Create the idempotency key from business identity and channel:

```text
MAINTENANCE_BILL_GENERATED:<billId>:WHATSAPP
DEPOSIT_PAYMENT_APPROVED:<paymentId>:WHATSAPP
CREDIT_PAYMENT_APPROVED:<paymentId>:WHATSAPP
```

Flow:

```text
NotificationService
      │
      ▼
Create notification record
      │
      ├── duplicate key → stop, do not queue
      │
      └── created
            │
            ▼
       Queue notificationId
```

The database unique constraint is the authoritative duplicate-protection mechanism.

The notification lifecycle should support at least:

```text
PENDING → QUEUED → PROCESSING → SENT
                         │
                         └────→ FAILED
```

If queue insertion fails after the DB record is created, the record must remain recoverable rather than being silently lost.

## 6. Retry

Use BullMQ retry/backoff for transient failures.

Do not retry permanent errors indefinitely.

A successful notification is marked `SENT` only after Meta accepts the message.

## 7. Dependency Direction

```text
Business Features
      ↓
Notification Service
      ↓
Notification Queue
      ↓
BullMQ / Redis

Worker
      ↓
Dispatcher
      ↓
WhatsApp Service
      ↓
WhatsApp Client
      ↓
Meta
```

Business features must never depend directly on WhatsApp or BullMQ internals.
