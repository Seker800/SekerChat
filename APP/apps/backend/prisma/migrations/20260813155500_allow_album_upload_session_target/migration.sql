ALTER TABLE "UploadSession"
  DROP CONSTRAINT "UploadSession_target_check";

ALTER TABLE "UploadSession"
  ADD CONSTRAINT "UploadSession_target_check"
  CHECK (
    ("kind" IN ('CHAT_ATTACHMENT', 'ARTIFACT') AND "groupId" IS NOT NULL AND "subscriptionAttachmentId" IS NULL)
    OR
    ("kind" = 'SUBSCRIPTION_ATTACHMENT' AND "groupId" IS NULL AND "subscriptionAttachmentId" IS NOT NULL)
    OR
    ("kind" = 'ALBUM_PHOTO' AND "groupId" IS NULL AND "subscriptionAttachmentId" IS NULL)
  );
