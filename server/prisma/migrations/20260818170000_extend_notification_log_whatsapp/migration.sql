-- Notification feature, Phase 1 (docs/notification/) — WhatsApp only, delivered via
-- node-cron rather than a queue/worker (see docs/notification/architecture.md's
-- 2026-08-18 revision note). Extends the existing NotificationLog model, which
-- exists in the schema but has no application code writing to it yet, so this
-- migration is safe to apply with no rows to backfill.
ALTER TYPE "NotificationChannel" ADD VALUE 'WHATSAPP';
ALTER TYPE "NotificationStatus" ADD VALUE 'PENDING';
ALTER TYPE "NotificationStatus" ADD VALUE 'PROCESSING';

-- AlterTable
ALTER TABLE "NotificationLog"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "eventType" TEXT,
  ADD COLUMN "payload" JSONB,
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "providerMessageId" TEXT,
  ADD COLUMN "error" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3),
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

ALTER TABLE "NotificationLog" RENAME COLUMN "recipient" TO "recipientUserId";

ALTER TABLE "NotificationLog"
  ALTER COLUMN "idempotencyKey" SET NOT NULL,
  ALTER COLUMN "eventType" SET NOT NULL,
  ALTER COLUMN "payload" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_idempotencyKey_key" ON "NotificationLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "NotificationLog_status_nextAttemptAt_idx" ON "NotificationLog"("status", "nextAttemptAt");
