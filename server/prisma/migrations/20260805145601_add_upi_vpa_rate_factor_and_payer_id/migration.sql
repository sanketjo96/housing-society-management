/*
  Warnings:

  - Added the required column `payerId` to the `MaintenanceRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `upiVpa` to the `Society` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MaintenanceRecord" ADD COLUMN     "payerId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Society" ADD COLUMN     "tenantRateFactor" DECIMAL(3,2) NOT NULL DEFAULT 1.5,
ADD COLUMN     "upiVpa" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "MaintenanceRecord_payerId_idx" ON "MaintenanceRecord"("payerId");

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
