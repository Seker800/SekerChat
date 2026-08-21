CREATE TYPE "BotReplyDeliveryStatus" AS ENUM (
  'CLAIMED',
  'GENERATED',
  'COMPLETED',
  'AMBIGUOUS'
);

CREATE TABLE "BotReplyDelivery" (
  "id" TEXT NOT NULL,
  "botUserId" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "status" "BotReplyDeliveryStatus" NOT NULL DEFAULT 'CLAIMED',
  "responseText" TEXT,
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BotReplyDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BotReplyDelivery_botUserId_sourceEventId_key"
ON "BotReplyDelivery"("botUserId", "sourceEventId");

CREATE INDEX "BotReplyDelivery_status_updatedAt_idx"
ON "BotReplyDelivery"("status", "updatedAt");

CREATE INDEX "BotReplyDelivery_groupId_createdAt_idx"
ON "BotReplyDelivery"("groupId", "createdAt");

ALTER TABLE "BotReplyDelivery"
ADD CONSTRAINT "BotReplyDelivery_botUserId_fkey"
FOREIGN KEY ("botUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BotReplyDelivery"
ADD CONSTRAINT "BotReplyDelivery_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
