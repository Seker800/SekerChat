ALTER TABLE "EagleImportRunItem"
DROP CONSTRAINT IF EXISTS "EagleImportRunItem_ownerId_activeUploadSessionId_fkey";

ALTER TABLE "EagleUploadSessionState"
DROP CONSTRAINT IF EXISTS "EagleUploadSessionState_ownerId_importRunItemId_fkey";

DROP INDEX IF EXISTS "EagleUploadSessionState_importRunItemId_idx";

ALTER TABLE "EagleUploadSessionState"
DROP COLUMN IF EXISTS "importRunItemId";

ALTER TABLE "EagleUploadSessionState"
DROP CONSTRAINT IF EXISTS "EagleUploadSessionState_duplicatePolicy_check";

UPDATE "EagleUploadSessionState"
SET "duplicatePolicy" = 'CREATE_COPY'
WHERE "duplicatePolicy" = 'IMPORT';

ALTER TABLE "EagleUploadSessionState"
ADD CONSTRAINT "EagleUploadSessionState_duplicatePolicy_check"
CHECK ("duplicatePolicy" IN ('SKIP', 'CREATE_COPY'));
