DROP INDEX "UploadSession_albumPhotoId_key";
CREATE INDEX "UploadSession_albumPhotoId_idx" ON "UploadSession"("albumPhotoId");
