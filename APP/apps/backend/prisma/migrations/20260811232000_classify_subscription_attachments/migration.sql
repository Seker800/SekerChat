CREATE TYPE "SubscriptionAttachmentUsage" AS ENUM ('INLINE_IMAGE', 'DOWNLOADABLE_FILE');

ALTER TABLE "SubscriptionAttachment"
ADD COLUMN "usage" "SubscriptionAttachmentUsage" NOT NULL DEFAULT 'DOWNLOADABLE_FILE';

UPDATE "SubscriptionAttachment" AS attachment
SET "usage" = 'INLINE_IMAGE'
FROM "SubscriptionPost" AS post
WHERE attachment."postId" = post."id"
  AND attachment."mimeType" LIKE 'image/%'
  AND post."body" LIKE ('%attachment://' || attachment."id" || '%');

CREATE INDEX "SubscriptionAttachment_postId_usage_status_createdAt_idx"
ON "SubscriptionAttachment"("postId", "usage", "status", "createdAt");
