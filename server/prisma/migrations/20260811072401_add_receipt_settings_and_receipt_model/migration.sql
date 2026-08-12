-- AlterTable
ALTER TABLE "Society" ADD COLUMN     "receiptFooterNote" TEXT,
ADD COLUMN     "receiptNumberPrefix" TEXT NOT NULL DEFAULT 'RCPT',
ADD COLUMN     "receiptSignatoryName" TEXT,
ADD COLUMN     "receiptSignatoryTitle" TEXT,
ADD COLUMN     "receiptSignatureFileKey" TEXT,
ADD COLUMN     "receiptSignatureMimeType" TEXT;

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ledgerEntryId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receiptNumber_key" ON "Receipt"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_ledgerEntryId_key" ON "Receipt"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "Receipt_societyId_idx" ON "Receipt"("societyId");

-- CreateIndex
CREATE INDEX "Receipt_issuedById_idx" ON "Receipt"("issuedById");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
