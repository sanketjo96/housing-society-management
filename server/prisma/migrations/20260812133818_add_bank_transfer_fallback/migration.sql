-- AlterTable
ALTER TABLE "Society" ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankIfsc" TEXT,
ALTER COLUMN "upiVpa" DROP NOT NULL;
