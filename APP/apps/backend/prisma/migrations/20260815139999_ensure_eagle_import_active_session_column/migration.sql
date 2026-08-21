-- Some early development databases applied the import-readiness migration before
-- activeUploadSessionId was added to that historical migration. Keep the upgrade
-- path additive and idempotent before the following migration makes the index unique.
ALTER TABLE "EagleImportRunItem"
ADD COLUMN IF NOT EXISTS "activeUploadSessionId" TEXT;
