CREATE TYPE "BotDispatchStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

CREATE TABLE "BotDispatchRecord" (
  "id" TEXT NOT NULL,
  "rootMessageId" TEXT NOT NULL,
  "parentDispatchId" TEXT,
  "groupId" TEXT NOT NULL,
  "botAgentId" TEXT NOT NULL,
  "botUserId" TEXT NOT NULL,
  "status" "BotDispatchStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "requestPayloadJson" JSONB,
  "responseSummary" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "depth" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BotDispatchRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BotDispatchRecord_rootMessageId_createdAt_idx" ON "BotDispatchRecord"("rootMessageId", "createdAt");
CREATE INDEX "BotDispatchRecord_groupId_createdAt_idx" ON "BotDispatchRecord"("groupId", "createdAt");
CREATE INDEX "BotDispatchRecord_botAgentId_status_createdAt_idx" ON "BotDispatchRecord"("botAgentId", "status", "createdAt");
CREATE INDEX "BotDispatchRecord_status_updatedAt_idx" ON "BotDispatchRecord"("status", "updatedAt");

ALTER TABLE "BotDispatchRecord"
ADD CONSTRAINT "BotDispatchRecord_botAgentId_fkey"
FOREIGN KEY ("botAgentId") REFERENCES "BotAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
