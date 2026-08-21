-- DropIndex
DROP INDEX IF EXISTS "AttendanceDaily_userId_workDate_key";

-- DropIndex
DROP INDEX IF EXISTS "AttendanceDaily_userId_workDate_idx";

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDaily_userId_workDate_mode_key" ON "AttendanceDaily"("userId", "workDate", "mode");

-- CreateIndex
CREATE INDEX "AttendanceDaily_userId_workDate_mode_idx" ON "AttendanceDaily"("userId", "workDate", "mode");
