# Notification Feature — Architecture (Phase 1: simplified, no Redis/BullMQ)

> **2026-08-18 revision.** The original draft of this doc specified a Redis + BullMQ
> queue with a dedicated worker process. That was reconsidered before implementation
> started: this app runs on a single 7.6GB VPS for a 24-flat society (CLAUDE.md's
> explicit "correctness over scale, do not over-engineer" mandate), the repo has
> **no Redis and no BullMQ today** — scheduling is `node-cron`, in-process, one file
> (`src/jobs/monthly-maintenance-generation.job.ts`) — and the realistic event volume
> here is on the order of ~25–40 notifications/month, not enough to justify a second
> stateful service to operate and back up. Everything requirements.md actually
> *requires* (asynchronous, non-blocking, idempotent, retryable, typed events,
> business code never touching WhatsApp/delivery internals) is achievable with the
> existing `NotificationLog` table plus the existing `node-cron` pattern. The
> BullMQ/Redis/worker design isn't wrong — it's sized for a scale this app doesn't
> have yet. It's preserved as the documented upgrade path in
> [`future-scope.md`](./future-scope.md); do not pre-build for it.

## 1. Placement

The existing application is feature-based. Add:

```text
server/src/features/notifications/
```

The delivery mechanism is a cron job, same as every other piece of scheduled work in
this app, so its entry point lives where those already live:

```text
server/src/jobs/
```

Do not create a separate microservice. Do not add a queue broker (Redis) or a
separate long-running worker process.

## 2. Runtime Flow

```text
Billing / Maintenance / Ledger
        │
        │ notify(event)  — plain async function call, in-process
        ▼
NotificationService.notify()
        │
        │ generate idempotency key, INSERT (unique constraint)
        ▼
NotificationLog row, status = PENDING
        │
        │ (returns immediately — the HTTP response / business
        │  transaction never waits for this)
        .
        .  ── minutes later ──
        .
        │ node-cron, every 1 minute (src/jobs/notification-delivery.job.ts)
        ▼
NotificationService.deliverPending()
        │  atomically claims eligible rows (PENDING or FAILED-and-retryable,
        │  nextAttemptAt <= now), marks them PROCESSING
        ▼
WhatsApp Service
        │  resolve recipient's phone from userId, pick template, build params
        ▼
WhatsApp Client
        │  Meta WhatsApp Cloud API HTTP call
        ▼
status → SENT (+ providerMessageId)   or   FAILED (+ error, nextAttemptAt bumped)
```

The API request (or the cron job that generated the business event, e.g. monthly
maintenance generation) ends the moment the `NotificationLog` row is committed.
WhatsApp delivery happens later, off that request's critical path, driven by the
delivery cron job — not by a queue consumer process.

## 3. Folder Structure

```text
server/src/features/notifications/
├── notification.service.ts       — public API: notify(event), deliverPending()
├── notification.types.ts         — typed event payloads (discriminated union)
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

server/src/jobs/
└── notification-delivery.job.ts  — node-cron entry point, same shape as
                                     monthly-maintenance-generation.job.ts;
                                     registered in server.ts
```

No `queue/` subfolder, no `worker/` subfolder. There is deliberately no
`notification.dispatcher.ts` yet either: Phase 1 has exactly one channel
(WhatsApp), so `notification.service.ts` calls the WhatsApp service directly. A
`channel`-keyed dispatcher is the natural place to add a second channel (Email)
later — add it *when* that channel exists, not speculatively now (see
`future-scope.md` and CLAUDE.md's "don't design for hypothetical future
requirements").

## 4. Responsibilities

### Notification Service (`notification.service.ts`)

Public API for business features. Two exported functions:

- **`notify(event: NotificationEvent): Promise<void>`** — generates the
  idempotency key, inserts a `NotificationLog` row as `PENDING`. If the insert
  collides on the unique `idempotencyKey` constraint, this is a duplicate
  business event — swallow it and return (nothing to deliver twice). Business
  features call only this; they never see `NotificationLog`, cron, or WhatsApp
  types.
- **`deliverPending(): Promise<void>`** — called by the cron job. Atomically
  claims eligible rows (`UPDATE ... SET status = 'PROCESSING' WHERE status IN
  ('PENDING','FAILED') AND (nextAttemptAt IS NULL OR nextAttemptAt <= now())
  RETURNING *`, `attemptCount < maxAttempts`), then for each row calls the
  WhatsApp service and updates status/`attemptCount`/`error`/`providerMessageId`/
  `sentAt`/`nextAttemptAt` accordingly. One row's failure doesn't stop the batch
  (same "one bad item shouldn't block the rest" pattern
  `runMonthlyMaintenanceGeneration` already uses per-society).

Business features must not know this table exists as anything other than "call
`notify()` and move on."

### Delivery job (`src/jobs/notification-delivery.job.ts`)

Thin, same shape as `monthly-maintenance-generation.job.ts`: registers on
`node-cron` in `server.ts` (e.g. every minute), calls
`NotificationService.deliverPending()`, logs a one-line summary. No provider
logic lives here — same "keep the job/worker thin" rule the original design
already had, just moved from a BullMQ worker process into a cron function.

```ts
// server.ts, alongside the existing monthly-maintenance cron registration
cron.schedule('* * * * *', () => {
  void deliverPendingNotifications();
});
```

### WhatsApp Service (`whatsapp/whatsapp.service.ts`)

Unchanged from the original design:

- Resolve recipient's current WhatsApp number from `recipientUserId` (looked up
  fresh at delivery time, never persisted on the event — a resident's number can
  change between when a bill is generated and when the notification actually
  sends).
- Select the template for the event's `eventType`.
- Build the template's parameters from the event's persisted `payload`.
- Call `whatsapp.client.ts`.
- Normalize the result into `{ providerMessageId }` or a typed error the service
  can distinguish as transient vs. permanent.

### WhatsApp Client (`whatsapp/whatsapp.client.ts`)

Owns Meta API HTTP details only — plain `fetch` against the Graph API, same
shape as `resend-email-provider.ts`'s HTTP call. Only this layer should know
Meta's request/response shape.

## 5. Notification Persistence and Idempotency

Reuse the existing `NotificationLog` model (`prisma/schema.prisma`) — it already
exists for exactly this purpose and is currently unused (no
`prisma.notificationLog` call anywhere in the codebase yet). Extend it rather
than introducing a second, competing table:

```prisma
enum NotificationChannel {
  EMAIL
  WHATSAPP        // new
}

enum NotificationStatus {
  PENDING         // new
  PROCESSING      // new
  SENT
  FAILED
}

model NotificationLog {
  id                String              @id @default(cuid())
  idempotencyKey    String              @unique   // new
  eventType         String                        // new
  channel           NotificationChannel
  recipientUserId   String                        // renamed from `recipient`:
                                                    // stores the userId, not a
                                                    // phone number — matches
                                                    // requirements.md's "events
                                                    // contain recipient.userId,
                                                    // not a phone number" rule
  payload           Json                          // new — the event's `data`,
                                                    // so deliverPending() can
                                                    // rebuild template params
                                                    // without re-deriving them
  status            NotificationStatus
  attemptCount      Int                 @default(0)   // new
  providerMessageId String?                           // new
  error             String?                           // new
  relatedEntityType String
  relatedEntityId   String
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt         // new
  sentAt            DateTime?                             // new
  nextAttemptAt     DateTime?                             // new — backoff gate

  @@index([relatedEntityType, relatedEntityId])
  @@index([status, nextAttemptAt])                        // new — the sweep's query
}
```

Idempotency key, same formula as the original design:

```text
MAINTENANCE_BILL_GENERATED:<billId>:WHATSAPP
DEPOSIT_PAYMENT_APPROVED:<paymentId>:WHATSAPP
CREDIT_PAYMENT_APPROVED:<paymentId>:WHATSAPP
```

Flow:

```text
NotificationService.notify()
      │
      ▼
INSERT NotificationLog (idempotencyKey UNIQUE)
      │
      ├── P2002 (duplicate key) → stop, already claimed, return
      │
      └── created → PENDING, picked up by the next cron sweep
```

**Detect the collision the way this codebase already does it**: use
`getUniqueConstraintFields` (`server/src/shared/errors/prisma-errors.ts`) — the
same helper every other duplicate-detection path in this app already relies on
(see CLAUDE.md's "Gotcha discovered building this" note on Prisma 7's actual
P2002 error shape). Do not write a second, bespoke P2002 check.

The database unique constraint is the authoritative duplicate-protection
mechanism — not an in-memory check, not anything queue-related (there is no
queue-level job ID to rely on in this design, which removes that whole failure
mode by construction).

Lifecycle:

```text
PENDING → PROCESSING → SENT
              │
              └────→ FAILED ──(nextAttemptAt reached, attemptCount < max)──→ PROCESSING
```

If the process crashes mid-sweep after claiming rows as `PROCESSING` but before
finishing them, those rows are not silently lost — they're still real rows in
the table. A future cleanup detail (**not required for Phase 1** given this
app's volume): a row stuck `PROCESSING` past some age is safe to reclaim on the
next sweep, since retrying an already-sent WhatsApp message is a mild UX
annoyance here, not a correctness bug (see `future-scope.md` if this ever needs
tightening).

## 6. Retry

`deliverPending()`'s claim query only picks up rows whose `nextAttemptAt` has
passed — on a transient failure, compute the next attempt time with simple
in-process backoff (e.g. `now + 2^attemptCount minutes`, capped) and store it on
the row; no external scheduler needed, since the cron sweep itself is already
the periodic check. Do not retry a permanent error (e.g. Meta rejects the
template/phone number as invalid) — mark it `FAILED` with `attemptCount` at the
max and stop; a human can see it in the `NotificationLog` table if needed. A
notification is marked `SENT` only after Meta accepts the message.

## 7. Dependency Direction

```text
Business Features (Billing, Ledger, Maintenance)
      ↓
Notification Service  (notify)
      ↓
NotificationLog (Postgres)
      ↑
Notification Service  (deliverPending, called by the cron job)
      ↓
WhatsApp Service
      ↓
WhatsApp Client
      ↓
Meta
```

Business features must never depend directly on WhatsApp, `NotificationLog`, or
the cron job's internals — `notify()` is the entire surface they see. There is
no BullMQ/Redis layer for anything to depend on in this design.
