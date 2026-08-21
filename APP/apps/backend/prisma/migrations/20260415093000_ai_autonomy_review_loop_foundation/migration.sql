CREATE TYPE "GroupAiReviewStatus" AS ENUM (
  'IDLE',
  'PENDING',
  'READY',
  'RUNNING',
  'PAUSED'
);

CREATE TABLE "GroupAiAutonomyConfig" (
  "groupId" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "autoExecuteLowRisk" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupAiAutonomyConfig_pkey" PRIMARY KEY ("groupId")
);

CREATE TABLE "GroupAiReviewState" (
  "groupId" TEXT NOT NULL,
  "status" "GroupAiReviewStatus" NOT NULL DEFAULT 'IDLE',
  "pendingReviewSince" TIMESTAMP(3),
  "lastMessageAt" TIMESTAMP(3),
  "lastTriggerMessageId" TEXT,
  "lastReviewedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "pausedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupAiReviewState_pkey" PRIMARY KEY ("groupId")
);

CREATE INDEX "GroupAiReviewState_status_lastMessageAt_idx" ON "GroupAiReviewState"("status", "lastMessageAt");
CREATE INDEX "GroupAiReviewState_status_nextRetryAt_idx" ON "GroupAiReviewState"("status", "nextRetryAt");

ALTER TABLE "GroupAiAutonomyConfig"
ADD CONSTRAINT "GroupAiAutonomyConfig_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupAiReviewState"
ADD CONSTRAINT "GroupAiReviewState_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
