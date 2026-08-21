ALTER TABLE "Message"
ADD COLUMN "mentionedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "replyToMessageId" TEXT;

CREATE INDEX "Message_replyToMessageId_idx" ON "Message"("replyToMessageId");

ALTER TABLE "Message"
ADD CONSTRAINT "Message_replyToMessageId_fkey"
FOREIGN KEY ("replyToMessageId") REFERENCES "Message"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
