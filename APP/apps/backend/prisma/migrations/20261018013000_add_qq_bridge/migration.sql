-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "externalAuthor" JSONB,
ADD COLUMN     "externalAvatarFileId" TEXT,
ADD COLUMN     "externalKey" TEXT;

-- CreateTable
CREATE TABLE "QqBridgeConnector" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "tokenHash" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "catalog" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QqBridgeConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QqBridgeBinding" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "qqGroupId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "bidirectional" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "enabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QqBridgeBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QqBridgeSource" (
    "id" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "messageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QqBridgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QqBridgeDelivery" (
    "id" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "messageId" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'send',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "leaseHash" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "externalId" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QqBridgeDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QqBridgeConnector_tokenHash_key" ON "QqBridgeConnector"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "QqBridgeBinding_groupId_key" ON "QqBridgeBinding"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "QqBridgeBinding_accountId_qqGroupId_key" ON "QqBridgeBinding"("accountId", "qqGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "QqBridgeSource_bindingId_externalId_key" ON "QqBridgeSource"("bindingId", "externalId");

-- CreateIndex
CREATE INDEX "QqBridgeDelivery_bindingId_status_createdAt_idx" ON "QqBridgeDelivery"("bindingId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QqBridgeDelivery_bindingId_messageId_action_key" ON "QqBridgeDelivery"("bindingId", "messageId", "action");

-- CreateIndex
CREATE UNIQUE INDEX "Message_externalKey_key" ON "Message"("externalKey");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_externalAvatarFileId_fkey" FOREIGN KEY ("externalAvatarFileId") REFERENCES "FileObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QqBridgeBinding" ADD CONSTRAINT "QqBridgeBinding_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "QqBridgeConnector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QqBridgeSource" ADD CONSTRAINT "QqBridgeSource_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "QqBridgeBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QqBridgeDelivery" ADD CONSTRAINT "QqBridgeDelivery_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "QqBridgeBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

