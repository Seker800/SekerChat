-- DropIndex
DROP INDEX "QqBridgeBinding_accountId_qqGroupId_key";

-- DropIndex
DROP INDEX "QqBridgeBinding_groupId_key";

-- DropIndex
DROP INDEX "UploadSession_albumPhotoId_idx";

-- AlterTable
ALTER TABLE "BotReplyDelivery" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "QqBridgeBinding" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ServerNameClaim" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "QqBridgeBinding_accountId_qqGroupId_idx" ON "QqBridgeBinding"("accountId", "qqGroupId");

-- CreateIndex
CREATE INDEX "QqBridgeBinding_groupId_idx" ON "QqBridgeBinding"("groupId");


-- An archived binding keeps its history while releasing its active routing slots.
CREATE UNIQUE INDEX "QqBridgeBinding_active_group_key" ON "QqBridgeBinding" ("groupId") WHERE "archivedAt" IS NULL;
CREATE UNIQUE INDEX "QqBridgeBinding_active_qq_group_key" ON "QqBridgeBinding" ("accountId", "qqGroupId") WHERE "archivedAt" IS NULL;
