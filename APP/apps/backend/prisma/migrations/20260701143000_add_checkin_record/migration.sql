CREATE TABLE "CheckInRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDate" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckInRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CheckInRecord_userId_workDate_key" ON "CheckInRecord"("userId", "workDate");
CREATE INDEX "CheckInRecord_workDate_idx" ON "CheckInRecord"("workDate");
CREATE INDEX "CheckInRecord_userId_workDate_idx" ON "CheckInRecord"("userId", "workDate");

ALTER TABLE "CheckInRecord"
ADD CONSTRAINT "CheckInRecord_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
