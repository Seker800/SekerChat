ALTER TABLE "Message"
ADD COLUMN "clientMessageId" TEXT;

CREATE UNIQUE INDEX "Message_senderId_clientMessageId_key"
ON "Message"("senderId", "clientMessageId");
