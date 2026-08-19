# Notification Feature — Future Scope: Redis + BullMQ + Worker Process

This is **not** the Phase 1 design. Phase 1 (`architecture.md`,
`implementation-tasks.md`, `claude-instructions.md`) delivers notifications with
the existing `NotificationLog` table and the existing `node-cron` scheduler —
no new infrastructure. This doc preserves the original, more heavyweight
design (a real message broker + dedicated worker process) as the intentional
upgrade path for when this app's actual needs outgrow that simple version —
so the idea isn't lost, and so nobody has to re-derive it from scratch later.

**Do not build this until one of the trigger conditions below is actually
true.** Building it speculatively is exactly the over-engineering CLAUDE.md's
non-functional requirements warn against ("correctness over scale... do not
over-engineer for multi-tenant scale, concurrency, or data volume").

## When to graduate to this

Any one of these is a real signal, not a hunch:

- **Volume**: notification events regularly exceed a few hundred/day (this
  MVP's actual volume is ~25–40/**month**, at 24 flats — two orders of
  magnitude below that).
- **Latency**: the business needs sub-minute delivery guarantees the
  once-a-minute cron sweep can't provide (e.g. an OTP-style flow — nothing in
  this app's current event list needs that).
- **Multiple channels at meaningful volume**: Email + WhatsApp + something
  else all live simultaneously and a shared broker's routing/retry semantics
  start pulling their weight over a `channel`-keyed dispatcher function.
- **Horizontal scale**: the backend runs as more than one instance/replica,
  and the single-VPS `node-cron`-per-process model would mean multiple
  processes racing to claim the same `NotificationLog` rows (the Phase 1
  design's atomic claim query tolerates this by accident, but a real queue is
  the correct tool once this is a real requirement, not an edge case).
- **Society count**: this app onboards enough societies that "correctness over
  scale... 24-flat MVP" (CLAUDE.md) is no longer the operative constraint.

## Architecture

## 1. Placement

```text
server/src/features/notifications/
```

Keep existing scheduled jobs under:

```text
server/src/jobs/
```

Still do not create a separate microservice — a worker *process* within this
same deployable, not a separate service with its own repo/deploy pipeline.

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

The API request ends after the notification job is safely queued. WhatsApp
delivery happens in the background, driven by the worker consuming the queue
(not by a cron sweep polling a table).

## 3. Folder Structure

```text
server/src/features/notifications/
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

Public API for business features. Accepts notification intent and handles
creation/queueing of the notification. Business features must not know about
BullMQ, Redis, or WhatsApp — same contract as the Phase 1 `notify()`, just
backed by a real queue instead of a `PENDING` row.

### Queue

Owns BullMQ configuration and job creation. The queue job should contain the
persisted `notificationId`, not a duplicated copy of the full business event —
same "the DB row is the source of truth" principle Phase 1 already
established, just with an actual job payload referencing it instead of a cron
sweep querying for it directly.

### Worker

A genuinely separate process (or at least a separate entry point/deployment
unit) consuming jobs and passing them to the dispatcher. Keep it thin — same
rule Phase 1's cron job followed.

### Dispatcher

Routes notification events to the appropriate channel. Worth having as a real
layer once there's more than one channel to route between (Phase 1
deliberately skipped this while WhatsApp was the only channel).

### WhatsApp Service / WhatsApp Client

Unchanged from Phase 1 — this part of the design was never the problem being
solved by this migration. Reuse it as-is.

## 5. Notification Persistence and Idempotency

Same `NotificationLog` table Phase 1 already built and populated — this
migration doesn't need a new table, just a new delivery mechanism sitting in
front of the same rows. Idempotency key format, unique-constraint enforcement,
and `getUniqueConstraintFields()` usage all carry over unchanged.

The lifecycle gains a real `QUEUED` state between `PENDING` and `PROCESSING`
(the original design's full `PENDING → QUEUED → PROCESSING → SENT/FAILED`),
representing "successfully handed to BullMQ," distinct from "written to the
DB but not yet queued" — meaningful once queue insertion is a separate
fallible step again (it wasn't, in the Phase 1 design, since there was no
queue to insert into).

If queue insertion fails after the DB record is created, the record must
remain recoverable rather than being silently lost — a reconciliation
sweep (ironically, a cron job) that re-queues any `PENDING` row older than a
few minutes is the natural safety net, and can reuse Phase 1's
`deliverPending()`-style claim query almost verbatim.

## 6. Retry

Use BullMQ retry/backoff for transient failures instead of the Phase 1
hand-rolled `nextAttemptAt` backoff. Do not retry permanent errors
indefinitely. A successful notification is marked `SENT` only after Meta
accepts the message — unchanged from Phase 1.

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

Business features must never depend directly on WhatsApp or BullMQ internals —
same rule as Phase 1, just with a real queue behind the abstraction instead of
a table.

## Migration notes (Phase 1 → this)

- `NotificationLog` schema is unchanged; add a `QUEUED` status value.
- `notify()`'s public signature is unchanged — callers never notice the
  migration.
- Delete `src/jobs/notification-delivery.job.ts` and its `server.ts`
  cron registration; replace with the BullMQ worker process's own entry point.
- Add `queue/`, `worker/`, and `notification.dispatcher.ts` per the folder
  structure above.
- Add Redis to `docker-compose.yml` (a new service, a new volume if
  persistence is wanted, a healthcheck — mirror the existing `postgres`
  service's shape) and a new `worker` service/container alongside `backend`.
- `whatsapp/` moves over unmodified.
