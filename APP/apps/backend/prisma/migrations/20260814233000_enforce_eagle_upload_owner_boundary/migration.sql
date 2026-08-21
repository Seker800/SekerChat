ALTER TABLE "EagleUploadSessionState"
DROP CONSTRAINT "EagleUploadSessionState_uploadSessionId_fkey";

CREATE UNIQUE INDEX IF NOT EXISTS "UploadSession_uploaderId_id_key"
ON "UploadSession"("uploaderId", "id");

CREATE UNIQUE INDEX "EagleUploadSessionState_ownerId_uploadSessionId_key"
ON "EagleUploadSessionState"("ownerId", "uploadSessionId");

ALTER TABLE "EagleUploadSessionState"
ADD CONSTRAINT "EagleUploadSessionState_ownerId_uploadSessionId_fkey"
FOREIGN KEY ("ownerId", "uploadSessionId")
REFERENCES "UploadSession"("uploaderId", "id")
ON DELETE CASCADE
ON UPDATE CASCADE;
