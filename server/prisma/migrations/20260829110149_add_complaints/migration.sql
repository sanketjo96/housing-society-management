-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ComplaintPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "possibleSolution" TEXT NOT NULL,
    "priority" "ComplaintPriority" NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "societyId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintUpvote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "complaintId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,

    CONSTRAINT "ComplaintUpvote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Complaint_societyId_idx" ON "Complaint"("societyId");

-- CreateIndex
CREATE INDEX "Complaint_ownerId_idx" ON "Complaint"("ownerId");

-- CreateIndex
CREATE INDEX "Complaint_flatId_idx" ON "Complaint"("flatId");

-- CreateIndex
CREATE INDEX "ComplaintUpvote_societyId_idx" ON "ComplaintUpvote"("societyId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintUpvote_complaintId_ownerId_key" ON "ComplaintUpvote"("complaintId", "ownerId");

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintUpvote" ADD CONSTRAINT "ComplaintUpvote_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintUpvote" ADD CONSTRAINT "ComplaintUpvote_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintUpvote" ADD CONSTRAINT "ComplaintUpvote_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
