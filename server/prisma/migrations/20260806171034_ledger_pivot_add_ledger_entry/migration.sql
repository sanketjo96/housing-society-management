-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('DEPOSIT', 'CREDIT');

-- DropForeignKey
ALTER TABLE "PaymentProof" DROP CONSTRAINT "PaymentProof_reviewedById_fkey";

-- DropForeignKey
ALTER TABLE "PaymentProof" DROP CONSTRAINT "PaymentProof_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "_MaintenanceRecordToPaymentProof" DROP CONSTRAINT "_MaintenanceRecordToPaymentProof_A_fkey";

-- DropForeignKey
ALTER TABLE "_MaintenanceRecordToPaymentProof" DROP CONSTRAINT "_MaintenanceRecordToPaymentProof_B_fkey";

-- DropIndex
DROP INDEX "MaintenanceRecord_status_idx";

-- AlterTable
ALTER TABLE "MaintenanceRecord" DROP COLUMN "status";

-- DropTable
DROP TABLE "PaymentProof";

-- DropTable
DROP TABLE "_MaintenanceRecordToPaymentProof";

-- DropEnum
DROP TYPE "PaymentStatus";

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "ProofStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "adminNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "flatId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "reviewedById" TEXT,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerEntry_flatId_idx" ON "LedgerEntry"("flatId");

-- CreateIndex
CREATE INDEX "LedgerEntry_status_idx" ON "LedgerEntry"("status");

-- CreateIndex
CREATE INDEX "LedgerEntry_type_idx" ON "LedgerEntry"("type");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

