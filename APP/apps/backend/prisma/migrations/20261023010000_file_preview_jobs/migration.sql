CREATE TABLE "FilePreviewJob" (
  "fileId" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseVersion" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FilePreviewJob_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "FilePreviewJob" ADD CONSTRAINT "FilePreviewJob_status_check" CHECK ("status" IN ('PENDING', 'PROCESSING', 'READY', 'FAILED'));
CREATE INDEX "FilePreviewJob_status_availableAt_idx" ON "FilePreviewJob"("status", "availableAt");
CREATE INDEX "FilePreviewJob_status_lockedAt_idx" ON "FilePreviewJob"("status", "lockedAt");
-- Backfill intent only; the worker reads objects after migration, outside requests.
INSERT INTO "FilePreviewJob" ("fileId", "status")
SELECT "id", CASE WHEN "thumbnailStorageKey" IS NOT NULL AND "imageWidth" IS NOT NULL AND "imageHeight" IS NOT NULL THEN 'READY' ELSE 'PENDING' END
FROM "FileObject" WHERE lower("mimeType") IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif');
