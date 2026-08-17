-- Receipts are now signed by the Chairman and Secretary (2026-08-17 addendum),
-- not a single free-text signatory name/title. These columns are no longer read
-- anywhere in the app.
ALTER TABLE "Society" DROP COLUMN "receiptSignatoryName",
DROP COLUMN "receiptSignatoryTitle";
