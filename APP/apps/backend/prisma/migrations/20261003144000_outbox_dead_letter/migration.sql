CREATE TABLE "OutboxDeadLetter" (
  "id" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL,
  "lastError" TEXT,
  "failedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxDeadLetter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OutboxDeadLetter_sourceEventId_key" ON "OutboxDeadLetter"("sourceEventId");
CREATE INDEX "OutboxDeadLetter_archivedAt_idx" ON "OutboxDeadLetter"("archivedAt");
