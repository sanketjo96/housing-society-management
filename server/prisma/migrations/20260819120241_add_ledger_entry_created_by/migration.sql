-- Adds LedgerEntry.createdById/createdByType — who actually created the row
-- (distinct from payerId, whose balance it affects). Never SYSTEM: a LedgerEntry is
-- never system-generated, only a resident's own action or an admin's manualDeposit.
--
-- Backfill for pre-existing rows uses two signals already present on every row and
-- consistent since this feature shipped:
--   - A manualDeposit-created row always has note = 'Manual deposit (cash/bank
--     transfer)' and reviewedById already set (at creation time, not later) — those
--     rows backfill to createdById = reviewedById, createdByType = 'ADMIN'.
--   - Every other row was the payer's own self-service Deposit/Credit — those
--     backfill to createdById = payerId, createdByType resolved from that payer's
--     real User.role (OWNER or TENANT).
CREATE TYPE "CreatedByType" AS ENUM ('OWNER', 'TENANT', 'ADMIN');

ALTER TABLE "LedgerEntry" ADD COLUMN "createdById" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "createdByType" "CreatedByType";

UPDATE "LedgerEntry"
SET "createdById" = "reviewedById",
    "createdByType" = 'ADMIN'
WHERE "note" = 'Manual deposit (cash/bank transfer)';

UPDATE "LedgerEntry" le
SET "createdById" = le."payerId",
    "createdByType" = u."role"::text::"CreatedByType"
FROM "User" u
WHERE le."payerId" = u."id"
  AND le."createdById" IS NULL;

ALTER TABLE "LedgerEntry" ALTER COLUMN "createdById" SET NOT NULL;
ALTER TABLE "LedgerEntry" ALTER COLUMN "createdByType" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
