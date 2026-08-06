/*
  Warnings:

  - Added the required column `mimeType` to the `PaymentProof` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PaymentProof" ADD COLUMN     "mimeType" TEXT NOT NULL;
