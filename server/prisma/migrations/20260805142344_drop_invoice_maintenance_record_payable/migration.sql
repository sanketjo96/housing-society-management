/*
  Warnings:

  - You are about to drop the column `invoiceId` on the `MaintenanceRecord` table. All the data in the column will be lost.
  - You are about to drop the `Invoice` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `dueDate` to the `MaintenanceRecord` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING_REVIEW', 'PAID');

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_flatId_fkey";

-- DropForeignKey
ALTER TABLE "MaintenanceRecord" DROP CONSTRAINT "MaintenanceRecord_invoiceId_fkey";

-- DropIndex
DROP INDEX "MaintenanceRecord_invoiceId_idx";

-- AlterTable
ALTER TABLE "MaintenanceRecord" DROP COLUMN "invoiceId",
ADD COLUMN     "dueDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID';

-- DropTable
DROP TABLE "Invoice";

-- DropEnum
DROP TYPE "InvoiceStatus";

-- CreateIndex
CREATE INDEX "MaintenanceRecord_status_idx" ON "MaintenanceRecord"("status");
