ALTER TABLE "UploadSession"
ADD COLUMN "eagleAssetId" TEXT;

CREATE INDEX "UploadSession_eagleAssetId_idx" ON "UploadSession"("eagleAssetId");

ALTER TABLE "UploadSession"
ADD CONSTRAINT "UploadSession_uploaderId_eagleAssetId_fkey"
FOREIGN KEY ("uploaderId", "eagleAssetId") REFERENCES "EagleAsset"("ownerId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UploadSession"
DROP CONSTRAINT "UploadSession_target_check";

ALTER TABLE "UploadSession"
ADD CONSTRAINT "UploadSession_target_check"
CHECK (
  (
    "kind" IN ('CHAT_ATTACHMENT', 'ARTIFACT')
    AND "groupId" IS NOT NULL
    AND "subscriptionAttachmentId" IS NULL
    AND "albumPhotoId" IS NULL
    AND "eagleAssetId" IS NULL
  )
  OR (
    "kind" = 'SUBSCRIPTION_ATTACHMENT'
    AND "groupId" IS NULL
    AND "subscriptionAttachmentId" IS NOT NULL
    AND "albumPhotoId" IS NULL
    AND "eagleAssetId" IS NULL
  )
  OR (
    "kind" = 'ALBUM_PHOTO'
    AND "groupId" IS NULL
    AND "subscriptionAttachmentId" IS NULL
    AND "eagleAssetId" IS NULL
  )
  OR (
    "kind" = 'EAGLE_ASSET'
    AND "groupId" IS NULL
    AND "subscriptionAttachmentId" IS NULL
    AND "albumPhotoId" IS NULL
  )
);
