-- CreateTable
CREATE TABLE "Flat" (
    "id" TEXT NOT NULL,
    "block" TEXT NOT NULL,
    "flatNumber" TEXT NOT NULL,
    "baseRate" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "societyId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "currentTenantId" TEXT,

    CONSTRAINT "Flat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OccupancyChange" (
    "id" TEXT NOT NULL,
    "effectiveStart" TIMESTAMP(3) NOT NULL,
    "effectiveEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "flatId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "OccupancyChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Flat_societyId_idx" ON "Flat"("societyId");

-- CreateIndex
CREATE UNIQUE INDEX "Flat_societyId_block_flatNumber_key" ON "Flat"("societyId", "block", "flatNumber");

-- CreateIndex
CREATE INDEX "OccupancyChange_flatId_idx" ON "OccupancyChange"("flatId");

-- CreateIndex
CREATE INDEX "OccupancyChange_tenantId_idx" ON "OccupancyChange"("tenantId");

-- AddForeignKey
ALTER TABLE "Flat" ADD CONSTRAINT "Flat_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flat" ADD CONSTRAINT "Flat_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flat" ADD CONSTRAINT "Flat_currentTenantId_fkey" FOREIGN KEY ("currentTenantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupancyChange" ADD CONSTRAINT "OccupancyChange_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupancyChange" ADD CONSTRAINT "OccupancyChange_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
