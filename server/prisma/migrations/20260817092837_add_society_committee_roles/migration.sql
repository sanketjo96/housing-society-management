-- AlterTable
ALTER TABLE "Society" ADD COLUMN     "chairmanId" TEXT,
ADD COLUMN     "secretaryId" TEXT,
ADD COLUMN     "treasurerId" TEXT;

-- AddForeignKey
ALTER TABLE "Society" ADD CONSTRAINT "Society_chairmanId_fkey" FOREIGN KEY ("chairmanId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Society" ADD CONSTRAINT "Society_secretaryId_fkey" FOREIGN KEY ("secretaryId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Society" ADD CONSTRAINT "Society_treasurerId_fkey" FOREIGN KEY ("treasurerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
