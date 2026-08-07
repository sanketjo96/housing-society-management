-- Credit re-introduced (2026-08-07, same day as its removal) in a different shape —
-- see CLAUDE.md's "Credit re-introduced" addendum. Every existing LedgerEntry row
-- predates this migration and was always a Deposit, so the backfill is unambiguous.
CREATE TYPE "LedgerType" AS ENUM ('DEPOSIT', 'CREDIT');

ALTER TABLE "LedgerEntry" ADD COLUMN "type" "LedgerType";
UPDATE "LedgerEntry" SET "type" = 'DEPOSIT';
ALTER TABLE "LedgerEntry" ALTER COLUMN "type" SET NOT NULL;
