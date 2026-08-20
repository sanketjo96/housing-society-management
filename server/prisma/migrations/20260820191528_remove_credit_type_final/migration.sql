-- Remove Credit from the system entirely, for the third and final time (2026-08-20):
-- LedgerEntry only ever represents a Deposit now. Overpaying past Outstanding is now
-- allowed (see the Deposit-cap removal in ledger-shared.ts/resident-ledger-service.ts)
-- and surfaces as Available Credit through the existing balance formula, so `type`
-- has nothing left to discriminate. Existing rows previously marked CREDIT keep their
-- amount counting toward the flat's balance exactly as before — only the label is
-- dropped, no data migration needed (mirrors the 2026-08-07 removal's reasoning).
ALTER TABLE "LedgerEntry" DROP COLUMN "type";
DROP TYPE "LedgerType";
