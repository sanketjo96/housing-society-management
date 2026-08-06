-- Hand-written, not `prisma migrate dev`'s auto-diff — this must be a RENAME, not a
-- drop-and-recreate, to preserve every existing Flat row's data (including live
-- interactive-use data in the seeded society, not just test fixtures).

-- RenameColumn
ALTER TABLE "Flat" RENAME COLUMN "block" TO "wing";

-- RenameIndex (keeps Prisma's default naming convention in sync with the new column
-- name, so a future `prisma migrate dev` diff doesn't see a spurious mismatch)
ALTER INDEX "Flat_societyId_block_flatNumber_key" RENAME TO "Flat_societyId_wing_flatNumber_key";
