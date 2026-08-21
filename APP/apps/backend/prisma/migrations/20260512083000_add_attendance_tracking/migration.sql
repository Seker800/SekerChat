-- CreateEnum
CREATE TYPE "AttendanceMode" AS ENUM ('SCHEDULED', 'FLEXIBLE');

-- CreateTable
CREATE TABLE "AttendanceUserPolicy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "AttendanceMode" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceUserPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceActionEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionType" TEXT NOT NULL,
    "requestMethod" TEXT NOT NULL,
    "requestPath" TEXT NOT NULL,
    "groupId" TEXT,
    "actorType" TEXT NOT NULL,

    CONSTRAINT "AttendanceActionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceDaily" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDate" TEXT NOT NULL,
    "mode" "AttendanceMode" NOT NULL,
    "clockInAt" TIMESTAMP(3),
    "clockOutAt" TIMESTAMP(3),
    "clockInSource" TEXT,
    "clockOutSource" TEXT,
    "clockInMissing" BOOLEAN NOT NULL DEFAULT false,
    "clockOutMissing" BOOLEAN NOT NULL DEFAULT false,
    "workedMinutes" INTEGER,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceUserPolicy_userId_key" ON "AttendanceUserPolicy"("userId");

-- CreateIndex
CREATE INDEX "AttendanceActionEvent_userId_occurredAt_idx" ON "AttendanceActionEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "AttendanceActionEvent_requestMethod_requestPath_occurredAt_idx" ON "AttendanceActionEvent"("requestMethod", "requestPath", "occurredAt");

-- CreateIndex
CREATE INDEX "AttendanceActionEvent_groupId_occurredAt_idx" ON "AttendanceActionEvent"("groupId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDaily_userId_workDate_key" ON "AttendanceDaily"("userId", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceDaily_workDate_idx" ON "AttendanceDaily"("workDate");

-- CreateIndex
CREATE INDEX "AttendanceDaily_userId_workDate_idx" ON "AttendanceDaily"("userId", "workDate");

-- AddForeignKey
ALTER TABLE "AttendanceUserPolicy" ADD CONSTRAINT "AttendanceUserPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceActionEvent" ADD CONSTRAINT "AttendanceActionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDaily" ADD CONSTRAINT "AttendanceDaily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
