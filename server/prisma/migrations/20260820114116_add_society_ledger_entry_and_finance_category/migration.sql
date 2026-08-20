-- CreateEnum
CREATE TYPE "SocietyLedgerDirection" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "SocietyLedgerPaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER');

-- CreateTable
CREATE TABLE "SocietyLedgerCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "direction" "SocietyLedgerDirection" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "societyId" TEXT NOT NULL,

    CONSTRAINT "SocietyLedgerCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocietyLedgerEntry" (
    "id" TEXT NOT NULL,
    "direction" "SocietyLedgerDirection" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "SocietyLedgerPaymentMethod" NOT NULL,
    "bankReference" TEXT,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "societyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,

    CONSTRAINT "SocietyLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocietyLedgerCategory_societyId_idx" ON "SocietyLedgerCategory"("societyId");

-- CreateIndex
CREATE UNIQUE INDEX "SocietyLedgerCategory_societyId_name_key" ON "SocietyLedgerCategory"("societyId", "name");

-- CreateIndex
CREATE INDEX "SocietyLedgerEntry_societyId_idx" ON "SocietyLedgerEntry"("societyId");

-- CreateIndex
CREATE INDEX "SocietyLedgerEntry_categoryId_idx" ON "SocietyLedgerEntry"("categoryId");

-- CreateIndex
CREATE INDEX "SocietyLedgerEntry_transactionDate_idx" ON "SocietyLedgerEntry"("transactionDate");

-- AddForeignKey
ALTER TABLE "SocietyLedgerCategory" ADD CONSTRAINT "SocietyLedgerCategory_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyLedgerEntry" ADD CONSTRAINT "SocietyLedgerEntry_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyLedgerEntry" ADD CONSTRAINT "SocietyLedgerEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SocietyLedgerCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyLedgerEntry" ADD CONSTRAINT "SocietyLedgerEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
