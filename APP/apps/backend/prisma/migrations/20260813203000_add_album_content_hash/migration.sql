ALTER TABLE "AlbumPhoto" ADD COLUMN "sha256" TEXT;
CREATE INDEX "AlbumPhoto_sha256_deletedAt_idx" ON "AlbumPhoto"("sha256", "deletedAt");

ALTER TYPE "AlbumMediaJobKind" ADD VALUE 'HASH_CONTENT';

ALTER TABLE "UploadSession" ADD COLUMN "objectCleanupPending" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "UploadSession_objectCleanupPending_updatedAt_idx"
ON "UploadSession"("objectCleanupPending", "updatedAt");
