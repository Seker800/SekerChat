ALTER TABLE "CheckInRecord" RENAME TO "CheckInSession";

ALTER TABLE "CheckInSession"
RENAME CONSTRAINT "CheckInRecord_pkey" TO "CheckInSession_pkey";

ALTER TABLE "CheckInSession"
RENAME CONSTRAINT "CheckInRecord_userId_fkey" TO "CheckInSession_userId_fkey";

DROP INDEX "CheckInRecord_userId_workDate_key";

ALTER INDEX "CheckInRecord_workDate_idx" RENAME TO "CheckInSession_workDate_idx";
ALTER INDEX "CheckInRecord_userId_workDate_idx" RENAME TO "CheckInSession_userId_workDate_idx";

CREATE INDEX "CheckInSession_userId_workDate_checkInAt_idx"
ON "CheckInSession"("userId", "workDate", "checkInAt");

CREATE INDEX "CheckInSession_userId_workDate_checkOutAt_idx"
ON "CheckInSession"("userId", "workDate", "checkOutAt");
