-- CreateEnum
CREATE TYPE "LedgerCategory" AS ENUM ('MAINTENANCE', 'OTHER_CHARGE');

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "category" "LedgerCategory" NOT NULL DEFAULT 'MAINTENANCE';

-- AlterTable
ALTER TABLE "PaymentIntent" ADD COLUMN     "category" "LedgerCategory" NOT NULL DEFAULT 'MAINTENANCE';

-- CreateTable
CREATE TABLE "FeeType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "societyId" TEXT NOT NULL,

    CONSTRAINT "FeeType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtherCharge" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "flatId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "feeTypeId" TEXT NOT NULL,
    "billedById" TEXT NOT NULL,

    CONSTRAINT "OtherCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeeType_societyId_idx" ON "FeeType"("societyId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeType_societyId_name_key" ON "FeeType"("societyId", "name");

-- CreateIndex
CREATE INDEX "OtherCharge_flatId_idx" ON "OtherCharge"("flatId");

-- CreateIndex
CREATE INDEX "OtherCharge_payerId_idx" ON "OtherCharge"("payerId");

-- CreateIndex
CREATE INDEX "OtherCharge_feeTypeId_idx" ON "OtherCharge"("feeTypeId");

-- AddForeignKey
ALTER TABLE "FeeType" ADD CONSTRAINT "FeeType_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherCharge" ADD CONSTRAINT "OtherCharge_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherCharge" ADD CONSTRAINT "OtherCharge_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherCharge" ADD CONSTRAINT "OtherCharge_feeTypeId_fkey" FOREIGN KEY ("feeTypeId") REFERENCES "FeeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherCharge" ADD CONSTRAINT "OtherCharge_billedById_fkey" FOREIGN KEY ("billedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
