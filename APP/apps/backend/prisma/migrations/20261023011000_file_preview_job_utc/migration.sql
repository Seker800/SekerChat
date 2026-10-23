-- Prisma DateTime stores UTC in timestamp-without-time-zone columns. Do not let
-- the host/PostgreSQL timezone turn retry delays into immediate retry loops.
ALTER TABLE "FilePreviewJob"
  ALTER COLUMN "availableAt" SET DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
  ALTER COLUMN "createdAt" SET DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
  ALTER COLUMN "updatedAt" SET DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP);
-- These are newly introduced backfill intents; make them available immediately.
UPDATE "FilePreviewJob" SET "availableAt" = timezone('UTC'::text, CURRENT_TIMESTAMP)
WHERE "status" = 'PENDING';
