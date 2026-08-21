ALTER TYPE "UploadSessionStatus" ADD VALUE IF NOT EXISTS 'ASSEMBLED';
ALTER TYPE "UploadSessionStatus" ADD VALUE IF NOT EXISTS 'FINALIZING';
ALTER TYPE "UploadSessionStatus" ADD VALUE IF NOT EXISTS 'FAILED';

ALTER TABLE "UploadSession"
  ADD COLUMN "completionParts" JSONB,
  ADD COLUMN "assembledAt" TIMESTAMP(3),
  ADD COLUMN "finalizationStartedAt" TIMESTAMP(3),
  ADD COLUMN "finalizationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastError" TEXT;

CREATE INDEX "UploadSession_status_updatedAt_idx"
  ON "UploadSession"("status", "updatedAt");

CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Message" ADD COLUMN "outboxEventId" TEXT;

CREATE UNIQUE INDEX "Message_outboxEventId_key" ON "Message"("outboxEventId");
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_createdAt_idx"
  ON "OutboxEvent"("aggregateType", "aggregateId", "createdAt");
