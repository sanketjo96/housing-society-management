-- AlterTable
ALTER TABLE "OtherCharge" ADD COLUMN     "settledByLedgerEntryId" TEXT;

-- CreateIndex
CREATE INDEX "OtherCharge_settledByLedgerEntryId_idx" ON "OtherCharge"("settledByLedgerEntryId");

-- AddForeignKey
ALTER TABLE "OtherCharge" ADD CONSTRAINT "OtherCharge_settledByLedgerEntryId_fkey" FOREIGN KEY ("settledByLedgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
