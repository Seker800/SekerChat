CREATE TABLE "PresenceDailySummary" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workDate" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "firstOnlineAt" TIMESTAMP(3),
  "lastOnlineAt" TIMESTAMP(3),
  "onlineWorkMinutes" INTEGER NOT NULL,
  "endIsOnline" BOOLEAN NOT NULL,
  "endIsDnd" BOOLEAN NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PresenceDailySummary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PresenceDailySummary_userId_workDate_key" ON "PresenceDailySummary"("userId", "workDate");
CREATE INDEX "PresenceDailySummary_workDate_idx" ON "PresenceDailySummary"("workDate");
