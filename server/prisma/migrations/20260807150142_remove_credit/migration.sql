-- Remove Credit from the system entirely (2026-08-07): LedgerEntry only ever
-- represents a Deposit now, so the type discriminator has nothing left to
-- discriminate.
ALTER TABLE "LedgerEntry" DROP COLUMN "type";
DROP TYPE "LedgerType";
