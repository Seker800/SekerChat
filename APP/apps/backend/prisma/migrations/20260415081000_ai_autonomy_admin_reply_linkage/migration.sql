ALTER TABLE "AdminPendingItem"
ADD COLUMN "adminChannelMessageId" TEXT;

CREATE UNIQUE INDEX "AdminPendingItem_adminChannelMessageId_key" ON "AdminPendingItem"("adminChannelMessageId");
